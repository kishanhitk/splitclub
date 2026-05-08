import { StatusBar } from 'expo-status-bar'
import * as AuthSession from 'expo-auth-session'
import * as DocumentPicker from 'expo-document-picker'
import * as Notifications from 'expo-notifications'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Linking, Platform, SafeAreaView, Share, useWindowDimensions } from 'react-native'
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Camera,
  Check,
  ChevronRight,
  CircleDollarSign,
  Download,
  Home,
  LogIn,
  LogOut,
  ListFilter,
  MessageCircle,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCcw,
  Repeat,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  TrendingUp,
  Trash2,
  UserCircle,
  Users,
  WalletCards,
  Wrench,
} from 'lucide-react-native'
import { Button, Input, ScrollView, SizableText, TamaguiProvider, Text, XStack, YStack } from 'tamagui'
import { seedLedger } from './src/data/seed'
import {
  applyGroupDefaultSplits,
  buildPaymentHandoff,
  buildRecurringOccurrence,
  calculateBalances,
  calculateDirectSettlements,
  calculateFriendBalanceSummaries,
  calculateReceiptItemSplits,
  convertExpensesToCurrency,
  exportCsv,
  exportJsonBackup,
  listUpcomingRecurringExpenses,
  mergeLedgers,
  roundMoney,
  searchExpenses,
  simplifyDebts,
  spendingByCategory,
  spendingTrend,
  summarizeCurrencyExposure,
  summarizeVisibility,
  validateGroupDefaultSplits,
} from './src/domain/split'
import { parseReceiptText } from './src/domain/receipts'
import { normalizeInviteTokenInput, parseInviteTokenFromUrl } from './src/domain/invites'
import { buildReminderNotifications } from './src/notifications/reminders'
import { buildLedgerNotifications } from './src/notifications/activity'
import { getAuthProviderConfig, hasRemoteAuthConfig } from './src/auth/provider'
import { loadLedger, resetLedger, saveLedger } from './src/storage/offline'
import { clearSession, createLocalSession, isSessionExpired, loadSession, refreshLocalSession, saveSession, sessionHeaders } from './src/storage/session'
import { tamaguiConfig } from './tamagui.config'

WebBrowser.maybeCompleteAuthSession()

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

const splitModes = ['equal', 'exact', 'percent', 'shares', 'adjustment']
const currencies = ['INR', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'AED', 'JPY', 'THB', 'IDR', 'MYR', 'PHP', 'HKD', 'CHF', 'SEK', 'NOK', 'DKK', 'NZD', 'ZAR']
const expenseKinds = ['expense', 'refund', 'reimbursement', 'debt']
const categories = ['Transport', 'Food', 'Lodging', 'Rent', 'Groceries', 'Utilities', 'Tickets']
const groupRoles = ['owner', 'admin', 'member', 'viewer']
const recurrenceOptions = ['none', 'weekly', 'monthly', 'yearly']
const paymentMethods = ['cash', 'upi', 'venmo', 'paypal', 'bank']
const paymentStatuses = ['recorded', 'pending', 'confirmed']
const groupViews = [
  { id: 'overview', label: 'Overview' },
  { id: 'friends', label: 'Friends' },
  { id: 'invites', label: 'Invites' },
]
const addExpenseSteps = [
  { id: 'basics', label: 'Basics' },
  { id: 'payers', label: 'Payers' },
  { id: 'split', label: 'Split' },
  { id: 'receipt', label: 'Receipt' },
  { id: 'review', label: 'Review' },
]

const navItems = [
  { id: 'activity', label: 'Activity', description: 'Ledger, search, comments', icon: ReceiptText },
  { id: 'groups', label: 'Groups', description: 'Members, invites, defaults', icon: Users },
  { id: 'add', label: 'Add', description: 'Create or itemize a bill', icon: Plus },
  { id: 'balances', label: 'Balances', description: 'Settle up and simplify', icon: WalletCards },
  { id: 'settings', label: 'More', description: 'Account, sync, exports', icon: Settings },
]

const moreDestinations = [
  { id: 'account', label: 'Account', description: 'Profile, privacy, and sign-in', icon: UserCircle },
  { id: 'notifications', label: 'Notifications', description: 'Recent changes and unread activity', icon: Bell },
  { id: 'privacy', label: 'Privacy', description: 'Visibility rules and private expenses', icon: ShieldCheck },
  { id: 'currencies', label: 'Currencies', description: 'Rates, defaults, and group conversion', icon: CircleDollarSign },
  { id: 'recurring', label: 'Recurring', description: 'Bills and native reminder scheduling', icon: Repeat },
  { id: 'analytics', label: 'Analytics', description: 'Category spend and monthly trends', icon: BarChart3 },
  { id: 'tools', label: 'Tools', description: 'Export, restore, storage, and sync utilities', icon: Wrench },
]

export default function App() {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SplitClubApp />
    </TamaguiProvider>
  )
}

function SplitClubApp() {
  const [ledger, setLedger] = useState(seedLedger)
  const [selectedGroupId, setSelectedGroupId] = useState('goa')
  const [activeTab, setActiveTab] = useState('activity')
  const [moreSection, setMoreSection] = useState('index')
  const [query, setQuery] = useState('')
  const [selectedExpenseId, setSelectedExpenseId] = useState(null)
  const [commentDraft, setCommentDraft] = useState('Looks good to me.')
  const [detailDescription, setDetailDescription] = useState('')
  const [detailAmount, setDetailAmount] = useState('')
  const [addExpenseStep, setAddExpenseStep] = useState('basics')
  const [splitMode, setSplitMode] = useState('equal')
  const [splitValues, setSplitValues] = useState({})
  const [amount, setAmount] = useState('3600')
  const [description, setDescription] = useState('Airport cab')
  const [currency, setCurrency] = useState('INR')
  const [expenseKind, setExpenseKind] = useState('expense')
  const [category, setCategory] = useState('Transport')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [recurrence, setRecurrence] = useState('none')
  const [reminderDays, setReminderDays] = useState('3')
  const [paidBy, setPaidBy] = useState('kishan')
  const [payerMode, setPayerMode] = useState('single')
  const [payerValues, setPayerValues] = useState({})
  const [attachmentName, setAttachmentName] = useState('receipt.jpg')
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptOcrText, setReceiptOcrText] = useState('Cab fare 2400\nToll 1200')
  const [itemLabel, setItemLabel] = useState('Ticket')
  const [itemAmount, setItemAmount] = useState('900')
  const [receiptItems, setReceiptItems] = useState([
    { id: 'item-1', label: 'Cab fare', amount: 2400, assignedTo: ['kishan', 'anya', 'dev', 'mia'] },
    { id: 'item-2', label: 'Toll', amount: 1200, assignedTo: ['kishan', 'anya', 'dev', 'mia'] },
  ])
  const [cloudReceipts, setCloudReceipts] = useState([])
  const [receiptLibraryStatus, setReceiptLibraryStatus] = useState('Not loaded')
  const [activeUserId, setActiveUserId] = useState('kishan')
  const [profileName, setProfileName] = useState('Kishan')
  const [profileEmail, setProfileEmail] = useState('kishan@example.com')
  const [profilePhone, setProfilePhone] = useState('')
  const [profilePayment, setProfilePayment] = useState('upi')
  const [identityStatus, setIdentityStatus] = useState('Invite identity ready')
  const [friendName, setFriendName] = useState('Rhea')
  const [friendEmail, setFriendEmail] = useState('rhea@example.com')
  const [inviteEmail, setInviteEmail] = useState('rhea@example.com')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteTokenInput, setInviteTokenInput] = useState('')
  const [inviteLinkStatus, setInviteLinkStatus] = useState('No invite link opened')
  const [pendingInvites, setPendingInvites] = useState([])
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false)
  const [groupView, setGroupView] = useState('overview')
  const [groupDefaultMode, setGroupDefaultMode] = useState('equal')
  const [groupDefaultValues, setGroupDefaultValues] = useState({})
  const [groupSimplifyDebts, setGroupSimplifyDebts] = useState(true)
  const [membershipRoles, setMembershipRoles] = useState({
    goa: { kishan: 'owner', anya: 'member', dev: 'member', mia: 'viewer' },
    flat: { kishan: 'owner', anya: 'admin', dev: 'member' },
  })
  const [privateBalances, setPrivateBalances] = useState(false)
  const [canceledRecurringIds, setCanceledRecurringIds] = useState([])
  const [notificationStatus, setNotificationStatus] = useState('Not scheduled')
  const [scheduledReminders, setScheduledReminders] = useState([])
  const [settlementMethod, setSettlementMethod] = useState('cash')
  const [settlementReference, setSettlementReference] = useState('')
  const [settlementStatus, setSettlementStatus] = useState('recorded')
  const [readNotificationIds, setReadNotificationIds] = useState([])
  const [authSession, setAuthSession] = useState(null)
  const [syncState, setSyncState] = useState('Offline ready')
  const [lastCloudSync, setLastCloudSync] = useState(null)
  const [lastCloudPush, setLastCloudPush] = useState(null)
  const { width } = useWindowDimensions()
  const isWideLayout = width >= 920

  useEffect(() => {
    loadLedger()
      .then(setLedger)
      .catch(() => setLedger(seedLedger))
  }, [])

  useEffect(() => {
    loadSession()
      .then((session) => {
        if (!session) return
        if (isSessionExpired(session)) {
          clearSession().catch(() => undefined)
          setSyncState('Session expired')
          return
        }
        setAuthSession(session)
        setActiveUserId(session.user.id)
        setSyncState('Session restored')
      })
      .catch(() => setSyncState('Session restore failed'))
  }, [])

  useEffect(() => {
    saveLedger(ledger).catch(() => setSyncState('Local save failed'))
  }, [ledger])

  const activeGroups = useMemo(() => ledger.groups.filter((group) => !group.deletedAt), [ledger.groups])
  const deletedGroups = useMemo(() => ledger.groups.filter((group) => group.deletedAt), [ledger.groups])
  const selectedGroup = selectedGroupId
    ? activeGroups.find((group) => group.id === selectedGroupId)
    : null
  const membersForGroup = selectedGroup
    ? ledger.members.filter((member) => selectedGroup.memberIds.includes(member.id))
    : ledger.members.slice(0, 2)
  const visibleExpenses = useMemo(() => searchExpenses(ledger, query), [ledger, query])
  const selectedExpense = useMemo(
    () => ledger.expenses.find((expense) => expense.id === selectedExpenseId) ?? null,
    [ledger.expenses, selectedExpenseId],
  )
  const balances = useMemo(() => calculateBalances(ledger, selectedGroupId, currency), [ledger, selectedGroupId, currency])
  const friendBalanceSummaries = useMemo(
    () => calculateFriendBalanceSummaries(ledger, activeUserId, currency),
    [ledger, activeUserId, currency],
  )
  const settlements = useMemo(
    () => selectedGroup?.simplifyDebts ?? false
      ? simplifyDebts(balances, currency)
      : calculateDirectSettlements(ledger, selectedGroupId, currency),
    [balances, currency, ledger, selectedGroup, selectedGroupId],
  )
  const categoryTotals = useMemo(
    () => spendingByCategory(ledger, selectedGroupId, currency).slice(0, 5),
    [ledger, selectedGroupId, currency],
  )
  const trendTotals = useMemo(
    () => spendingTrend(ledger, selectedGroupId, currency),
    [ledger, selectedGroupId, currency],
  )
  const currencyExposure = useMemo(
    () => summarizeCurrencyExposure(ledger, selectedGroupId, currency),
    [ledger, selectedGroupId, currency],
  )
  const accountNotifications = useMemo(
    () => buildLedgerNotifications(ledger, new Set(readNotificationIds)).slice(0, 30),
    [ledger, readNotificationIds],
  )
  const unreadNotificationCount = accountNotifications.filter((notification) => !notification.read).length
  const visibilitySummary = useMemo(
    () => summarizeVisibility(ledger, activeUserId, selectedGroupId),
    [ledger, activeUserId, selectedGroupId],
  )
  const totalSpending = categoryTotals.reduce((sum, item) => sum + item.amount, 0)
  const expenseMemberIds = membersForGroup.map((member) => member.id)
  const splitPreview = useMemo(
    () => buildSplitPreview(Number(amount), splitMode, expenseMemberIds, splitValues),
    [amount, splitMode, expenseMemberIds, splitValues],
  )
  const payerShares = useMemo(
    () => valuesToSplits(payerValuesWithFallback(payerValues, membersForGroup.map((member) => member.id), Number(amount), paidBy), membersForGroup.map((member) => member.id)),
    [payerValues, membersForGroup, amount, paidBy],
  )
  const payerTotal = roundMoney(payerShares.reduce((sum, payment) => sum + payment.value, 0))
  const payerValidation = payerMode === 'single'
    ? { valid: true, message: paidBy }
    : {
        valid: payerTotal === roundMoney(Number(amount)),
        message: payerTotal === roundMoney(Number(amount)) ? 'Payers match total' : `${payerTotal.toFixed(2)} paid`,
      }
  const groupDefaultSplits = useMemo(
    () => valuesToSplits(groupDefaultValues, membersForGroup.map((member) => member.id)),
    [groupDefaultValues, membersForGroup],
  )
  const groupDefaultValidation = useMemo(
    () => validateGroupDefaultSplits(groupDefaultMode, membersForGroup.map((member) => member.id), groupDefaultSplits),
    [groupDefaultMode, membersForGroup, groupDefaultSplits],
  )
  const itemizedTotal = roundMoney(receiptItems.reduce((sum, item) => sum + Number(item.amount || 0), 0))
  const itemizedSplits = useMemo(
    () => calculateReceiptItemSplits(
      receiptItems.map((item) => ({ ...item, amount: Number(item.amount || 0) })),
      expenseMemberIds,
      Number(amount),
    ),
    [receiptItems, expenseMemberIds, amount],
  )
  const upcomingRecurring = useMemo(
    () => listUpcomingRecurringExpenses(ledger, canceledRecurringIds),
    [ledger, canceledRecurringIds],
  )

  const memberName = (memberId) => ledger.members.find((member) => member.id === memberId)?.name ?? 'Someone'
  const memberPreferredPayment = (memberId) => ledger.members.find((member) => member.id === memberId)?.preferredPayment ?? 'cash'
  const activeUser =
    ledger.members.find((member) => member.id === activeUserId) ??
    (authSession
      ? {
          id: authSession.user.id,
          name: authSession.user.name ?? authSession.user.email ?? 'Signed-in member',
          email: authSession.user.email,
          phone: authSession.user.phone,
          avatar: authSession.user.avatar ?? 'SC',
          preferredPayment: 'cash',
        }
      : ledger.members[0])

  useEffect(() => {
    if (!activeUser) return
    setProfileName(activeUser.name ?? '')
    setProfileEmail(activeUser.email ?? authSession?.user.email ?? '')
    setProfilePhone(activeUser.phone ?? authSession?.user.phone ?? '')
    setProfilePayment(activeUser.preferredPayment ?? 'cash')
  }, [activeUser?.id, activeUser?.name, activeUser?.email, activeUser?.phone, activeUser?.preferredPayment, authSession?.user.email, authSession?.user.phone])

  const selectedRole = selectedGroupId ? membershipRoles[selectedGroupId]?.[activeUserId] ?? 'viewer' : 'member'
  const cloudApiUrl = process.env.EXPO_PUBLIC_SPLITCLUB_API_URL?.replace(/\/$/, '') ?? ''
  const cloudSyncReady = Boolean(cloudApiUrl && authSession)
  const selectedGroupDefaultsKey = selectedGroup
    ? `${selectedGroup.id}:${selectedGroup.defaultCurrency}:${selectedGroup.defaultSplitMode}:${selectedGroup.defaultSplits.map((split) => `${split.memberId}-${split.value}`).join('|')}`
    : 'non-group'

  const lifecycleEvent = (expenseId, action, summary) => ({
    id: `history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    expenseId,
    memberId: activeUser.id,
    action,
    summary,
    createdAt: new Date().toISOString(),
  })

  const routeToInviteToken = (token) => {
    setInviteTokenInput(token)
    setInviteLinkStatus(`Invite token ready: ${token}`)
    setSelectedExpenseId(null)
    setGroupSettingsOpen(false)
    setGroupView('invites')
    setMoreSection('index')
    setActiveTab('groups')
    setSyncState('Invite link opened')
  }

  const applyGroupDefaultsToExpense = (group = selectedGroup) => {
    if (!group) {
      setSplitMode('equal')
      setSplitValues({})
      return
    }
    const defaults = applyGroupDefaultSplits(group)
    setSplitMode(defaults.splitMode)
    setSplitValues(splitsToValues(defaults.splits, group.memberIds, defaults.splitMode, Number(amount)))
    setCurrency(group.defaultCurrency)
    setSyncState(`Using ${group.name} defaults`)
  }

  useEffect(() => {
    applyGroupDefaultsToExpense(selectedGroup)
  }, [selectedGroupDefaultsKey])

  useEffect(() => {
    let mounted = true
    const handleUrl = (url) => {
      const token = parseInviteTokenFromUrl(url)
      if (token) routeToInviteToken(token)
    }

    Linking.getInitialURL()
      .then((url) => {
        if (mounted && url) handleUrl(url)
      })
      .catch(() => undefined)

    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url))
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  const setExpenseSplitMode = (mode) => {
    setSplitMode(mode)
    setSplitValues((current) => ensureSplitValues(mode, membersForGroup.map((member) => member.id), Number(amount), current))
  }

  const setExpenseSplitValue = (memberId, value) => {
    setSplitValues((current) => ({ ...current, [memberId]: value }))
  }

  const setExpensePayerMode = (mode) => {
    setPayerMode(mode)
    setPayerValues(mode === 'multiple' ? payerValuesWithFallback(payerValues, membersForGroup.map((member) => member.id), Number(amount), paidBy) : {})
  }

  const setExpensePayerValue = (memberId, value) => {
    setPayerValues((current) => ({ ...current, [memberId]: value }))
  }

  const openGroupSettings = () => {
    if (!selectedGroup) return
    setGroupDefaultMode(selectedGroup.defaultSplitMode)
    setGroupDefaultValues(splitsToValues(selectedGroup.defaultSplits, selectedGroup.memberIds, selectedGroup.defaultSplitMode, Number(amount)))
    setGroupSimplifyDebts(selectedGroup.simplifyDebts)
    setGroupSettingsOpen(true)
  }

  const closeGroupSettings = () => {
    setGroupSettingsOpen(false)
  }

  const setGroupDefaultModeValue = (mode) => {
    setGroupDefaultMode(mode)
    setGroupDefaultValues((current) => ensureSplitValues(mode, membersForGroup.map((member) => member.id), Number(amount), current))
  }

  const setGroupDefaultValue = (memberId, value) => {
    setGroupDefaultValues((current) => ({ ...current, [memberId]: value }))
  }

  const saveGroupDefaults = () => {
    if (!selectedGroup) return
    if (!groupDefaultValidation.valid) {
      Alert.alert('Check defaults', groupDefaultValidation.message)
      return
    }
    const defaultSplits = groupDefaultMode === 'equal' ? [] : groupDefaultSplits
    setLedger((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === selectedGroup.id
          ? { ...group, simplifyDebts: groupSimplifyDebts, defaultSplitMode: groupDefaultMode, defaultSplits }
          : group,
      ),
    }))
    setSplitMode(groupDefaultMode)
    setSplitValues(splitsToValues(defaultSplits, selectedGroup.memberIds, groupDefaultMode, Number(amount)))
    setSyncState('Group defaults saved')
    setGroupSettingsOpen(false)
    pushCloudJson(`/api/groups/${selectedGroup.id}/defaults`, {
      simplifyDebts: groupSimplifyDebts,
      defaultSplitMode: groupDefaultMode,
      defaultSplits,
    }, 'Group defaults', 'PUT').catch(() => undefined)
  }

  const openExpense = (expense) => {
    setSelectedExpenseId(expense.id)
    setDetailDescription(expense.description)
    setDetailAmount(String(expense.amount))
    setCommentDraft('Looks good to me.')
  }

  const closeExpense = () => {
    setSelectedExpenseId(null)
  }

  const signIn = async () => {
    const config = getAuthProviderConfig()
    try {
      if (!hasRemoteAuthConfig(config)) {
        const session = createLocalSession({
          id: activeUser.id,
          name: activeUser.name,
          email: activeUser.email,
          avatar: activeUser.avatar,
          provider: 'local',
        })
        await saveSession(session)
        setAuthSession(session)
        setSyncState('Local session active')
        return
      }

      const redirectUri = AuthSession.makeRedirectUri({ scheme: 'splitclub' })
      const discovery = await AuthSession.fetchDiscoveryAsync(config.issuer)
      const request = new AuthSession.AuthRequest({
        clientId: config.clientId,
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        scopes: config.scopes,
        usePKCE: true,
        extraParams: config.audience ? { audience: config.audience } : undefined,
      })
      const result = await request.promptAsync(discovery)
      if (result.type !== 'success' || !result.params.code) {
        setSyncState('Sign in canceled')
        return
      }
      const token = await AuthSession.exchangeCodeAsync(
        {
          clientId: config.clientId,
          code: result.params.code,
          redirectUri,
          extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
        },
        discovery,
      )
      const userInfo = discovery.userInfoEndpoint
        ? await fetch(discovery.userInfoEndpoint, { headers: { Authorization: `Bearer ${token.accessToken}` } }).then((response) => response.json())
        : {}
      const session = {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: new Date(Date.now() + (token.expiresIn ?? 3600) * 1000).toISOString(),
        user: {
          id: userInfo.sub ?? activeUser.id,
          email: userInfo.email,
          phone: userInfo.phone_number,
          name: userInfo.name ?? userInfo.given_name ?? activeUser.name,
          avatar: userInfo.picture,
          provider: config.provider,
        },
      }
      await saveSession(session)
      setAuthSession(session)
      setActiveUserId(session.user.id)
      setSyncState('Signed in')
    } catch (error) {
      setSyncState('Sign in failed')
      Alert.alert('Sign in failed', error instanceof Error ? error.message : 'Check auth provider configuration.')
    }
  }

  const refreshSession = async () => {
    if (!authSession) return
    const config = getAuthProviderConfig()
    try {
      if (hasRemoteAuthConfig(config) && authSession.refreshToken) {
        const discovery = await AuthSession.fetchDiscoveryAsync(config.issuer)
        const token = await AuthSession.refreshAsync(
          {
            clientId: config.clientId,
            refreshToken: authSession.refreshToken,
          },
          discovery,
        )
        const session = {
          ...authSession,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken ?? authSession.refreshToken,
          expiresAt: new Date(Date.now() + (token.expiresIn ?? 3600) * 1000).toISOString(),
        }
        await saveSession(session)
        setAuthSession(session)
      } else {
        const session = refreshLocalSession(authSession)
        await saveSession(session)
        setAuthSession(session)
      }
      setSyncState('Session refreshed')
    } catch (error) {
      setSyncState('Refresh failed')
      Alert.alert('Refresh failed', error instanceof Error ? error.message : 'Try signing in again.')
    }
  }

  const signOut = async () => {
    await clearSession()
    setAuthSession(null)
    setSyncState('Signed out')
  }

  const pushCloudJson = async (path, payload, label, method = 'POST', options = {}) => {
    if (!cloudSyncReady) return
    try {
      const response = await fetch(`${cloudApiUrl}${path}`, {
        method,
        headers: {
          ...sessionHeaders(authSession),
          ...(options.baseRevision ? { 'x-splitclub-base-revision': options.baseRevision } : {}),
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      })
      if (response.status === 409) {
        const body = await response.json().catch(() => ({}))
        setLastCloudPush({
          at: new Date().toISOString(),
          label,
          path,
          status: 'conflict',
          message: body.message ?? 'Cloud copy changed before your push.',
          conflict: body.conflict,
        })
        setSyncState(`${label} has a cloud conflict`)
        return
      }
      if (!response.ok) {
        throw new Error(`Worker returned ${response.status}`)
      }
      setLastCloudPush({ at: new Date().toISOString(), label, path, status: 'sent' })
      setSyncState(`${label} synced to cloud`)
    } catch (error) {
      setLastCloudPush({
        at: new Date().toISOString(),
        label,
        path,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Cloud push failed',
      })
      setSyncState(`${label} saved locally; cloud push failed`)
    }
  }

  const saveAccountIdentity = async () => {
    const name = profileName.trim()
    const email = profileEmail.trim().toLowerCase()
    const phone = profilePhone.trim()
    if (!name) {
      Alert.alert('Name required', 'Add a display name before saving your account.')
      return
    }
    if (!email && !phone) {
      Alert.alert('Contact required', 'Link an email or phone so invites can be verified against your account.')
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Check email', 'Add a valid email address or leave it blank.')
      return
    }

    const updatedMember = {
      id: activeUser.id,
      name,
      email: email || undefined,
      phone: phone || undefined,
      avatar: activeUser.avatar ?? name.slice(0, 2).toUpperCase(),
      preferredPayment: profilePayment,
    }
    setLedger((current) => {
      const exists = current.members.some((member) => member.id === updatedMember.id)
      return {
        ...current,
        members: exists
          ? current.members.map((member) => (member.id === updatedMember.id ? { ...member, ...updatedMember } : member))
          : [updatedMember, ...current.members],
      }
    })
    setIdentityStatus(email && phone ? 'Email and phone linked' : email ? 'Email linked' : 'Phone linked')
    setSyncState('Account identity saved locally')

    if (authSession) {
      const nextSession = {
        ...authSession,
        user: {
          ...authSession.user,
          id: updatedMember.id,
          name: updatedMember.name,
          email: updatedMember.email,
          phone: updatedMember.phone,
          avatar: updatedMember.avatar,
        },
      }
      await saveSession(nextSession)
      setAuthSession(nextSession)
    }

    pushCloudJson('/api/account', {
      name: updatedMember.name,
      email: updatedMember.email,
      phone: updatedMember.phone,
      avatar: updatedMember.avatar,
      preferredPayment: updatedMember.preferredPayment,
    }, 'Account identity', 'PUT').catch(() => undefined)
  }

  const addExpense = () => {
    const numericAmount = Number(amount)
    if (!description.trim() || Number.isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Check the bill', 'Add a description and a valid amount.')
      return
    }
    if (!splitPreview.valid) {
      Alert.alert('Split does not balance', splitPreview.message)
      return
    }
    if (!payerValidation.valid) {
      Alert.alert('Payers do not match', payerValidation.message)
      return
    }

    const participants = membersForGroup.map((member) => member.id)
    const splits = splitMode === 'equal' ? [] : splitPreview.splits
    const payments = payerMode === 'multiple' ? payerShares.filter((payment) => payment.value > 0) : []
    const updatedAt = new Date().toISOString()

    const expense = {
      id: `expense-${Date.now()}`,
      groupId: selectedGroupId ?? null,
      description: description.trim(),
      amount: numericAmount,
      currency,
      paidBy: paidBy || participants[0],
      payments,
      participants,
      splitMode,
      splits: splitMode === 'equal' ? [] : splits,
      category: splitMode === 'adjustment' ? 'Adjustment' : category,
      kind: expenseKind,
      date,
      notes: notes || `${expenseKind} · ${splitMode} split created on ${Platform.OS}`,
      attachmentName: attachmentName || undefined,
      receiptItems: receiptItems.map((item) => ({
        ...item,
        amount: Number(item.amount),
        assignedTo: item.assignedTo.length > 0 ? item.assignedTo : participants,
      })),
      recurrence,
      reminderDays: recurrence === 'none' ? undefined : Number(reminderDays || 0),
      comments: [],
      history: [],
      updatedAt,
    }
    expense.history = [lifecycleEvent(expense.id, 'created', `${activeUser.name} created this expense`)]

    setLedger((current) => ({ ...current, expenses: [expense, ...current.expenses] }))
    setSyncState('Saved locally')
    setActiveTab('activity')
    openExpense(expense)
    pushCloudJson('/api/expenses', expense, 'Expense').catch(() => undefined)
  }

  const updateSelectedExpense = () => {
    if (!selectedExpense) return
    const numericAmount = Number(detailAmount)
    if (!detailDescription.trim() || Number.isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Check the edit', 'Description and amount are required.')
      return
    }
    const updatePayload = {
      description: detailDescription.trim(),
      amount: roundMoney(numericAmount),
    }
    const baseRevision = expenseRevision(selectedExpense)
    const updatedAt = new Date().toISOString()
    setLedger((current) => ({
      ...current,
      expenses: current.expenses.map((expense) =>
        expense.id === selectedExpense.id
          ? {
              ...expense,
              ...updatePayload,
              updatedAt,
              history: [
                lifecycleEvent(expense.id, 'updated', `${activeUser.name} updated description or amount`),
                ...(expense.history ?? []),
              ],
            }
          : expense,
      ),
    }))
    setSyncState('Expense updated')
    pushCloudJson(`/api/expenses/${selectedExpense.id}`, updatePayload, 'Expense edit', 'PUT', { baseRevision }).catch(() => undefined)
  }

  const addExpenseComment = () => {
    if (!selectedExpense || !commentDraft.trim()) return
    const comment = {
      id: `comment-${Date.now()}`,
      expenseId: selectedExpense.id,
      memberId: activeUser.id,
      body: commentDraft.trim(),
      createdAt: new Date().toISOString(),
    }
    setLedger((current) => ({
      ...current,
      expenses: current.expenses.map((expense) =>
        expense.id === selectedExpense.id
          ? {
              ...expense,
              comments: [...(expense.comments ?? []), comment],
              history: [
                lifecycleEvent(expense.id, 'commented', `${activeUser.name} commented`),
                ...(expense.history ?? []),
              ],
            }
          : expense,
      ),
    }))
    setCommentDraft('')
    setSyncState('Comment added')
    pushCloudJson(`/api/expenses/${selectedExpense.id}/comments`, { body: comment.body }, 'Expense comment').catch(() => undefined)
  }

  const deleteSelectedExpense = () => {
    if (!selectedExpense) return
    const deletedAt = new Date().toISOString()
    const baseRevision = expenseRevision(selectedExpense)
    setLedger((current) => ({
      ...current,
      expenses: current.expenses.map((expense) =>
        expense.id === selectedExpense.id
          ? {
              ...expense,
              deletedAt,
              updatedAt: deletedAt,
              history: [
                lifecycleEvent(expense.id, 'deleted', `${activeUser.name} deleted this expense`),
                ...(expense.history ?? []),
              ],
            }
          : expense,
      ),
    }))
    setSyncState('Expense deleted')
    pushCloudJson(`/api/expenses/${selectedExpense.id}`, undefined, 'Expense delete', 'DELETE', { baseRevision }).catch(() => undefined)
  }

  const restoreSelectedExpense = () => {
    if (!selectedExpense) return
    const baseRevision = expenseRevision(selectedExpense)
    const updatedAt = new Date().toISOString()
    setLedger((current) => ({
      ...current,
      expenses: current.expenses.map((expense) =>
        expense.id === selectedExpense.id
          ? {
              ...expense,
              deletedAt: undefined,
              updatedAt,
              history: [
                lifecycleEvent(expense.id, 'restored', `${activeUser.name} restored this expense`),
                ...(expense.history ?? []),
              ],
            }
          : expense,
      ),
    }))
    setSyncState('Expense restored')
    pushCloudJson(`/api/expenses/${selectedExpense.id}/restore`, {}, 'Expense restore', 'POST', { baseRevision }).catch(() => undefined)
  }

  const deleteSelectedGroup = () => {
    if (!selectedGroup) return
    const deletedAt = new Date().toISOString()
    setLedger((current) => ({
      ...current,
      groups: current.groups.map((group) => group.id === selectedGroup.id ? { ...group, deletedAt } : group),
    }))
    setSelectedGroupId(null)
    setSyncState('Group deleted')
    pushCloudJson(`/api/groups/${selectedGroup.id}`, undefined, 'Group delete', 'DELETE').catch(() => undefined)
  }

  const restoreGroup = (groupId) => {
    setLedger((current) => ({
      ...current,
      groups: current.groups.map((group) => group.id === groupId ? { ...group, deletedAt: undefined } : group),
    }))
    setSelectedGroupId(groupId)
    setSyncState('Group restored')
    pushCloudJson(`/api/groups/${groupId}/restore`, {}, 'Group restore').catch(() => undefined)
  }

  const applyCurrencyConversion = () => {
    setLedger((current) => convertExpensesToCurrency(current, selectedGroupId, currency, activeUser.id))
    setSyncState(`Converted ${selectedGroup?.name ?? 'non-group expenses'} to ${currency}`)
  }

  const markNotificationRead = (notificationId) => {
    setReadNotificationIds((ids) => ids.includes(notificationId) ? ids : [...ids, notificationId])
  }

  const markAllNotificationsRead = () => {
    setReadNotificationIds((ids) => [...new Set([...ids, ...accountNotifications.map((notification) => notification.id)])])
    setSyncState('Notifications read')
  }

  const addReceiptItem = () => {
    const numericAmount = Number(itemAmount)
    if (!itemLabel.trim() || Number.isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Check item', 'Add an item label and valid amount.')
      return
    }
    setReceiptItems((items) => [
      ...items,
      {
        id: `item-${Date.now()}`,
        label: itemLabel.trim(),
        amount: numericAmount,
        assignedTo: membersForGroup.map((member) => member.id),
      },
    ])
    setItemLabel('')
    setItemAmount('')
  }

  const toggleReceiptItemAssignment = (itemId, memberId) => {
    setReceiptItems((items) => items.map((item) => {
      if (item.id !== itemId) return item
      const assignedTo = item.assignedTo.includes(memberId)
        ? item.assignedTo.filter((id) => id !== memberId)
        : [...item.assignedTo, memberId]
      return { ...item, assignedTo }
    }))
  }

  const applyItemizedSplit = () => {
    if (receiptItems.length === 0) {
      Alert.alert('No receipt items', 'Add or extract receipt items first.')
      return
    }
    setSplitMode('exact')
    setSplitValues(Object.fromEntries(itemizedSplits.map((split) => [split.memberId, String(split.value)])))
    setSyncState('Itemized split applied')
  }

  const chooseReceipt = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    setReceiptFile(asset)
    setAttachmentName(asset.name ?? 'receipt')
    setSyncState('Receipt selected')
  }

  const extractReceiptPreview = () => {
    const participants = membersForGroup.map((member) => member.id)
    const extracted = parseReceiptText(receiptOcrText, participants)
    if (!extracted.length) {
      Alert.alert('No line items found', 'Add OCR text with one item and amount per line.')
      return
    }
    setReceiptItems(extracted)
    setSyncState('OCR items ready for review')
  }

  const uploadReceipt = async () => {
    const apiUrl = process.env.EXPO_PUBLIC_SPLITCLUB_API_URL
    if (!receiptFile) {
      Alert.alert('Choose a receipt', 'Select an image or PDF before uploading.')
      return
    }
    if (!apiUrl || !authSession) {
      extractReceiptPreview()
      setSyncState('Receipt reviewed locally')
      return
    }
    const form = new FormData()
    if (receiptFile.file) {
      form.append('file', receiptFile.file)
    } else {
      form.append('file', {
        uri: receiptFile.uri,
        name: receiptFile.name ?? 'receipt',
        type: receiptFile.mimeType ?? 'application/octet-stream',
      })
    }
    form.append('ocrText', receiptOcrText)
    membersForGroup.forEach((member) => form.append('assignedTo', member.id))
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/api/receipts`, {
      method: 'POST',
      headers: sessionHeaders(authSession),
      body: form,
    })
    if (!response.ok) {
      Alert.alert('Upload failed', `Receipt upload returned ${response.status}.`)
      return
    }
    const body = await response.json()
    setReceiptItems(body.extractedItems ?? [])
    setAttachmentName(body.receipt?.fileName ?? receiptFile.name ?? 'receipt')
    if (body.receipt) {
      setCloudReceipts((receipts) => [body.receipt, ...receipts.filter((receipt) => receipt.id !== body.receipt.id)])
      setReceiptLibraryStatus('Receipt saved to cloud library')
    }
    setSyncState('Receipt uploaded')
  }

  const loadCloudReceipts = async () => {
    if (!cloudSyncReady) {
      setReceiptLibraryStatus('Sign in and configure cloud sync to load receipts')
      Alert.alert('Cloud receipts unavailable', 'Sign in and set EXPO_PUBLIC_SPLITCLUB_API_URL to load receipt history.')
      return
    }
    try {
      const response = await fetch(`${cloudApiUrl}/api/receipts`, {
        headers: sessionHeaders(authSession),
      })
      if (!response.ok) {
        throw new Error(`Worker returned ${response.status}`)
      }
      const body = await response.json()
      setCloudReceipts(body.receipts ?? [])
      setReceiptLibraryStatus(`${body.receipts?.length ?? 0} cloud receipts loaded`)
    } catch (error) {
      setReceiptLibraryStatus(error instanceof Error ? error.message : 'Receipt library failed to load')
    }
  }

  const applyCloudReceipt = (receiptId) => {
    const receipt = cloudReceipts.find((candidate) => candidate.id === receiptId)
    if (!receipt) return
    setAttachmentName(receipt.fileName ?? 'receipt')
    setReceiptItems(receipt.extractedItems ?? [])
    if (receipt.ocrText) setReceiptOcrText(receipt.ocrText)
    setSyncState('Receipt items applied')
  }

  const removeReceiptItem = (itemId) => {
    setReceiptItems((items) => items.filter((item) => item.id !== itemId))
  }

  const addFriend = () => {
    if (!friendName.trim()) {
      Alert.alert('Friend name required', 'Add a name before saving a friend.')
      return
    }
    const friend = {
      id: `${friendName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      name: friendName.trim(),
      email: friendEmail.trim() || undefined,
      avatar: friendName.trim().slice(0, 2).toUpperCase(),
      preferredPayment: 'upi',
    }
    setLedger((current) => ({ ...current, members: [friend, ...current.members] }))
    setSyncState('Friend added')
    pushCloudJson('/api/friends', friend, 'Friend').catch(() => undefined)
  }

  const createInvite = () => {
    if (!selectedGroupId || !inviteEmail.trim()) {
      Alert.alert('Invite needs a group and email', 'Choose a group and add an email.')
      return
    }
    const invite = {
      id: `invite-${Date.now()}`,
      groupId: selectedGroupId,
      invitedEmail: inviteEmail.trim(),
      role: inviteRole,
      status: 'pending',
      token: `join_${Date.now()}`,
    }
    setPendingInvites((invites) => [invite, ...invites])
    setSyncState('Invite created')
    pushCloudJson(`/api/groups/${selectedGroupId}/invites`, {
      invitedEmail: invite.invitedEmail,
      role: invite.role,
    }, 'Group invite').catch(() => undefined)
  }

  const buildInviteLink = (invite) => {
    const encodedToken = encodeURIComponent(invite.token)
    if (cloudApiUrl) return `${cloudApiUrl}/invite/${encodedToken}`
    return `splitclub://invite/${encodedToken}`
  }

  const shareInvite = async (inviteId) => {
    const invite = pendingInvites.find((candidate) => candidate.id === inviteId)
    if (!invite) return
    const group = ledger.groups.find((candidate) => candidate.id === invite.groupId)
    const link = buildInviteLink(invite)
    const message = `Join ${group?.name ?? 'SplitClub'} on SplitClub: ${link}\nInvite token: ${invite.token}`

    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(message)
          setSyncState('Invite link copied')
          return
        }
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ title: 'SplitClub invite', text: message, url: link })
          setSyncState('Invite shared')
          return
        }
        Alert.alert('Invite link', message)
        setSyncState('Invite link ready')
        return
      }
      await Share.share({ title: 'SplitClub invite', message, url: link })
      setSyncState('Invite shared')
    } catch (error) {
      setSyncState('Invite share failed')
      Alert.alert('Invite share failed', error instanceof Error ? error.message : message)
    }
  }

  const applyAcceptedInvite = (invite, acceptedBy = activeUser.id) => {
    if (!invite) return
    const inviteEmail = invite.invitedEmail?.toLowerCase()
    const invitePhone = invite.invitedPhone
    const invitee = ledger.members.find((member) =>
      (inviteEmail && member.email?.toLowerCase() === inviteEmail) || (invitePhone && member.phone === invitePhone),
    ) ?? ledger.members.find((member) => member.id === acceptedBy) ?? activeUser
    const acceptedInvite = { ...invite, status: 'accepted', acceptedBy: invitee.id }
    setPendingInvites((invites) => {
      const existing = invites.find((candidate) => candidate.id === invite.id || candidate.token === invite.token)
      if (!existing) return [acceptedInvite, ...invites]
      return invites.map((candidate) =>
        candidate.id === existing.id ? { ...candidate, ...acceptedInvite, id: candidate.id } : candidate,
      )
    })
    setLedger((current) => ({
      ...current,
      members: current.members.some((member) => member.id === invitee.id) ? current.members : [invitee, ...current.members],
      groups: current.groups.map((group) =>
        group.id === invite.groupId && !group.memberIds.includes(invitee.id)
          ? { ...group, memberIds: [...group.memberIds, invitee.id] }
          : group,
      ),
    }))
    setMembershipRoles((current) => ({
      ...current,
      [invite.groupId]: {
        ...(current[invite.groupId] ?? {}),
        [invitee.id]: invite.role,
      },
    }))
    if (invite.groupId) setSelectedGroupId(invite.groupId)
    setGroupView('invites')
    setSyncState('Invite accepted')
  }

  const acceptInvite = (inviteId) => {
    const invite = pendingInvites.find((candidate) => candidate.id === inviteId)
    if (!invite || invite.status !== 'pending') return
    applyAcceptedInvite(invite)
    pushCloudJson(`/api/invites/${invite.token}/accept`, {}, 'Invite acceptance').catch(() => undefined)
  }

  const acceptInviteToken = async () => {
    const token = normalizeInviteTokenInput(inviteTokenInput)
    if (!token) {
      setInviteLinkStatus('Paste a valid invite token or link')
      Alert.alert('Invite token needed', 'Paste a SplitClub invite link or token.')
      return
    }
    setInviteTokenInput(token)
    const localInvite = pendingInvites.find((candidate) => candidate.token === token || candidate.id === token)

    if (cloudSyncReady) {
      try {
        const response = await fetch(`${cloudApiUrl}/api/invites/${encodeURIComponent(token)}/accept`, {
          method: 'POST',
          headers: sessionHeaders(authSession),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(body.message ?? `Worker returned ${response.status}`)
        }
        applyAcceptedInvite(body.invite ?? localInvite, body.membership?.userId ?? activeUser.id)
        setInviteLinkStatus('Invite accepted from cloud')
        return
      } catch (error) {
        setInviteLinkStatus(error instanceof Error ? error.message : 'Cloud invite acceptance failed')
      }
    }

    if (localInvite) {
      applyAcceptedInvite(localInvite)
      setInviteLinkStatus('Invite accepted locally')
      pushCloudJson(`/api/invites/${token}/accept`, {}, 'Invite acceptance').catch(() => undefined)
      return
    }

    setSyncState('Invite needs cloud sign-in')
    setInviteLinkStatus('Invite not found locally. Sign in with cloud sync to accept it.')
    Alert.alert('Invite not found locally', 'Sign in and configure the Worker API to accept invite links that are not already on this device.')
  }

  const setMemberRole = (memberId, role) => {
    if (!selectedGroupId) return
    setMembershipRoles((current) => ({
      ...current,
      [selectedGroupId]: {
        ...(current[selectedGroupId] ?? {}),
        [memberId]: role,
      },
    }))
    setSyncState('Permissions updated')
    pushCloudJson(`/api/groups/${selectedGroupId}/members/${memberId}`, {
      role,
    }, 'Member role', 'PUT').catch(() => undefined)
  }

  const removeMember = (memberId) => {
    if (!selectedGroupId) return
    const balance = calculateBalances(ledger, selectedGroupId, currency).find((item) => item.memberId === memberId)
    if (balance && Math.abs(balance.amount) >= 0.01) {
      setSyncState(`Settle ${memberName(memberId)} before removing`)
      return
    }
    setLedger((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === selectedGroupId ? { ...group, memberIds: group.memberIds.filter((id) => id !== memberId) } : group,
      ),
    }))
    setSyncState('Member removed')
    pushCloudJson(`/api/groups/${selectedGroupId}/members/${memberId}`, undefined, 'Member removal', 'DELETE').catch(() => undefined)
  }

  const requestReminderPermission = async () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && !('Notification' in window)) {
      setNotificationStatus('Web notifications unavailable')
      return false
    }
    const existing = await Notifications.getPermissionsAsync()
    const finalStatus = existing.granted ? existing : await Notifications.requestPermissionsAsync()
    setNotificationStatus(finalStatus.granted ? 'Notifications enabled' : 'Notifications denied')
    return finalStatus.granted
  }

  const scheduleRecurringReminders = async () => {
    const plans = buildReminderNotifications(upcomingRecurring)
    if (!plans.length) {
      setScheduledReminders([])
      setNotificationStatus('No reminders to schedule')
      return
    }

    const allowed = await requestReminderPermission()
    if (!allowed) return

    if (Platform.OS === 'web') {
      localStorage.setItem('splitclub.webReminders.v1', JSON.stringify(plans))
      setScheduledReminders(plans)
      setNotificationStatus(`${plans.length} web reminders saved`)
      return
    }

    await Promise.all(
      plans.map((plan) =>
        Notifications.scheduleNotificationAsync({
          identifier: plan.identifier,
          content: {
            title: plan.title,
            body: plan.body,
            data: { sourceExpenseId: plan.sourceExpenseId },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(plan.triggerAt),
          },
        }),
      ),
    )
    setScheduledReminders(plans)
    setNotificationStatus(`${plans.length} reminders scheduled`)
  }

  const cancelReminderForExpense = async (sourceExpenseId) => {
    const remaining = scheduledReminders.filter((plan) => plan.sourceExpenseId !== sourceExpenseId)
    const removed = scheduledReminders.filter((plan) => plan.sourceExpenseId === sourceExpenseId)
    if (Platform.OS === 'web') {
      localStorage.setItem('splitclub.webReminders.v1', JSON.stringify(remaining))
    } else {
      await Promise.all(removed.map((plan) => Notifications.cancelScheduledNotificationAsync(plan.identifier)))
    }
    setScheduledReminders(remaining)
  }

  const postRecurringOccurrence = (sourceExpenseId) => {
    const upcoming = upcomingRecurring.find((item) => item.sourceExpenseId === sourceExpenseId)
    const source = ledger.expenses.find((expense) => expense.id === sourceExpenseId)
    if (!upcoming || !source) return

    const occurrence = buildRecurringOccurrence(source, {
      id: `expense-${Date.now()}`,
      dueDate: upcoming.dueDate,
      createdAt: new Date().toISOString(),
      actorId: activeUser.id,
    })
    const sourceBaseRevision = expenseRevision(source)
    const sourceUpdatedAt = new Date().toISOString()

    setLedger((current) => ({
      ...current,
      expenses: [
        occurrence,
        ...current.expenses.map((expense) =>
          expense.id === sourceExpenseId ? { ...expense, date: upcoming.dueDate, updatedAt: sourceUpdatedAt } : expense,
        ),
      ],
    }))
    cancelReminderForExpense(sourceExpenseId).catch(() => undefined)
    setSyncState('Recurring bill posted')
    pushCloudJson('/api/expenses', occurrence, 'Recurring bill').catch(() => undefined)
    pushCloudJson(`/api/expenses/${sourceExpenseId}`, { date: upcoming.dueDate }, 'Recurring schedule', 'PUT', { baseRevision: sourceBaseRevision }).catch(() => undefined)
  }

  const cancelRecurring = (sourceExpenseId) => {
    setCanceledRecurringIds((ids) => [...new Set([...ids, sourceExpenseId])])
    cancelReminderForExpense(sourceExpenseId).catch(() => undefined)
    setSyncState('Recurring bill canceled')
  }

  const addSettlement = (from, to, settlementAmount) => {
    const settlement = {
      id: `settlement-${Date.now()}`,
      groupId: selectedGroupId ?? null,
      description: `${memberName(from)} paid back ${memberName(to)}`,
      amount: settlementAmount,
      currency,
      paidBy: to,
      participants: [from],
      splitMode: 'exact',
      splits: [{ memberId: from, value: settlementAmount }],
      category: 'Settlement',
      kind: 'settlement',
      paymentMethod: settlementMethod,
      paymentReference: settlementReference.trim() || undefined,
      paymentStatus: settlementStatus,
      date: new Date().toISOString().slice(0, 10),
      notes: `${settlementMethod.toUpperCase()} settlement recorded outside SplitClub`,
    }
    setLedger((current) => ({ ...current, expenses: [settlement, ...current.expenses] }))
    setSyncState('Settlement recorded')
    setSettlementReference('')
    pushCloudJson('/api/settlements', {
      groupId: settlement.groupId,
      from,
      to,
      amount: settlementAmount,
      currency,
      date: settlement.date,
      notes: settlement.notes,
      paymentMethod: settlement.paymentMethod,
      paymentReference: settlement.paymentReference,
      paymentStatus: settlement.paymentStatus,
    }, 'Settlement').catch(() => undefined)
  }

  const openPaymentHandoff = async (settlement) => {
    const recipientName = memberName(settlement.to)
    const handoff = buildPaymentHandoff({
      method: settlementMethod,
      amount: settlement.amount,
      currency: settlement.currency,
      recipientName,
      reference: settlementReference,
    })

    if (!handoff.available || !handoff.url) {
      setSyncState(handoff.message)
      Alert.alert(handoff.label, handoff.message)
      return
    }

    try {
      await Linking.openURL(handoff.url)
      setSyncState(handoff.message)
    } catch (error) {
      setSyncState('Payment app unavailable')
      Alert.alert('Payment app unavailable', error instanceof Error ? error.message : handoff.message)
    }
  }

  const pullCloudSync = async () => {
    if (!cloudApiUrl) {
      setSyncState('Cloud API not configured')
      Alert.alert('Cloud API not configured', 'Set EXPO_PUBLIC_SPLITCLUB_API_URL to enable Worker sync.')
      return
    }
    if (!authSession) {
      setSyncState('Sign in before cloud sync')
      Alert.alert('Sign in required', 'Sign in before pulling cloud data.')
      return
    }
    try {
      const response = await fetch(`${cloudApiUrl}/api/sync`, {
        headers: sessionHeaders(authSession),
      })
      if (!response.ok) {
        setSyncState(`Cloud sync failed: ${response.status}`)
        Alert.alert('Cloud sync failed', `Worker returned ${response.status}.`)
        return
      }
      const body = await response.json()
      if (!body.ledger) {
        setSyncState('Cloud sync returned no ledger')
        return
      }
      const { ledger: merged, summary } = mergeLedgers(ledger, body.ledger)
      setLedger(merged)
      setLastCloudSync({
        at: new Date().toISOString(),
        cursor: body.cursor ?? null,
        ...summary,
      })
      setSyncState(`Cloud sync pulled ${summary.expensesAdded} expenses`)
    } catch (error) {
      setSyncState('Cloud sync failed')
      Alert.alert('Cloud sync failed', error instanceof Error ? error.message : 'Check the Worker URL and auth session.')
    }
  }

  const resolveCloudConflict = (conflictId, strategy) => {
    const conflict = lastCloudSync?.conflicts?.find((item) => item.id === conflictId)
    if (!conflict) return

    if (strategy === 'local') {
      setLedger((current) => ({
        ...current,
        members: conflict.entity === 'member' ? replaceRecord(current.members, conflict.localRecord) : current.members,
        groups: conflict.entity === 'group' ? replaceRecord(current.groups, conflict.localRecord) : current.groups,
        expenses: conflict.entity === 'expense' ? replaceRecord(current.expenses, conflict.localRecord) : current.expenses,
      }))
    }

    setLastCloudSync((current) => {
      if (!current) return current
      return syncSummaryWithConflicts(
        current,
        (current.conflicts ?? []).filter((item) => item.id !== conflictId),
      )
    })
    setSyncState(strategy === 'local' ? 'Local version restored' : 'Cloud version kept')
  }

  const shareExport = () => {
    const csv = exportCsv(ledger)
    if (Platform.OS === 'web') {
      downloadTextFile(`splitclub-export-${date}.csv`, csv, 'text/csv')
      setSyncState(`CSV downloaded: ${csv.split('\n').length - 1} rows`)
      return
    }
    Alert.alert('CSV export ready', `${csv.split('\n').length - 1} rows prepared.`)
  }

  const shareBackup = () => {
    const backup = exportJsonBackup(ledger)
    if (Platform.OS === 'web') {
      downloadTextFile(`splitclub-backup-${date}.json`, backup, 'application/json')
      setSyncState('Full backup downloaded')
      return
    }
    Alert.alert('Backup ready', 'A full JSON backup was prepared.')
  }

  const restoreDemo = async () => {
    const restored = await resetLedger()
    setLedger(restored)
    setQuery('')
    setSyncState('Demo data restored')
  }

  const currentRoute = buildRouteMeta({
    activeTab,
    moreSection,
    selectedExpense,
    selectedGroup,
    groupSettingsOpen,
  })
  const hasRouteBack = Boolean(selectedExpense || groupSettingsOpen || (activeTab === 'settings' && moreSection !== 'index'))
  const handleRouteBack = () => {
    if (selectedExpense) {
      closeExpense()
      return
    }
    if (groupSettingsOpen) {
      closeGroupSettings()
      return
    }
    if (activeTab === 'settings' && moreSection !== 'index') {
      setMoreSection('index')
    }
  }
  const handlePrimaryRouteChange = (tab) => {
    setSelectedExpenseId(null)
    setGroupSettingsOpen(false)
    setMoreSection('index')
    setActiveTab(tab)
  }

  const appState = {
    ledger,
    activeUser,
    authSession,
    signIn,
    signOut,
    refreshSession,
    activeUserId,
    setActiveUserId,
    profileName,
    setProfileName,
    profileEmail,
    setProfileEmail,
    profilePhone,
    setProfilePhone,
    profilePayment,
    setProfilePayment,
    identityStatus,
    saveAccountIdentity,
    selectedRole,
    selectedGroup,
    groupSettingsOpen,
    groupView,
    setGroupView,
    openGroupSettings,
    closeGroupSettings,
    groupDefaultMode,
    setGroupDefaultModeValue,
    groupDefaultValues,
    setGroupDefaultValue,
    groupSimplifyDebts,
    setGroupSimplifyDebts,
    groupDefaultValidation,
    saveGroupDefaults,
    activeGroups,
    deletedGroups,
    selectedGroupId,
    setSelectedGroupId,
    activeTab,
    setActiveTab,
    selectedExpense,
    openExpense,
    closeExpense,
    commentDraft,
    setCommentDraft,
    detailDescription,
    setDetailDescription,
    detailAmount,
    setDetailAmount,
    updateSelectedExpense,
    addExpenseStep,
    setAddExpenseStep,
    addExpenseComment,
    deleteSelectedExpense,
    restoreSelectedExpense,
    deleteSelectedGroup,
    restoreGroup,
    moreSection,
    setMoreSection,
    query,
    setQuery,
    splitMode,
    setSplitMode: setExpenseSplitMode,
    splitValues,
    setExpenseSplitValue,
    applyGroupDefaultsToExpense,
    splitPreview,
    amount,
    setAmount,
    description,
    setDescription,
    currency,
    setCurrency,
    expenseKind,
    setExpenseKind,
    category,
    setCategory,
    date,
    setDate,
    notes,
    setNotes,
    recurrence,
    setRecurrence,
    reminderDays,
    setReminderDays,
    paidBy,
    setPaidBy,
    payerMode,
    setPayerMode: setExpensePayerMode,
    payerValues,
    setExpensePayerValue,
    payerShares,
    payerValidation,
    attachmentName,
    setAttachmentName,
    receiptFile,
    receiptOcrText,
    setReceiptOcrText,
    chooseReceipt,
    extractReceiptPreview,
    uploadReceipt,
    itemLabel,
    setItemLabel,
    itemAmount,
    setItemAmount,
    receiptItems,
    cloudReceipts,
    receiptLibraryStatus,
    itemizedTotal,
    itemizedSplits,
    addReceiptItem,
    toggleReceiptItemAssignment,
    applyItemizedSplit,
    loadCloudReceipts,
    applyCloudReceipt,
    removeReceiptItem,
    friendName,
    setFriendName,
    friendEmail,
    setFriendEmail,
    addFriend,
    inviteEmail,
    setInviteEmail,
    inviteRole,
    setInviteRole,
    inviteTokenInput,
    setInviteTokenInput,
    inviteLinkStatus,
    pendingInvites,
    createInvite,
    shareInvite,
    acceptInvite,
    acceptInviteToken,
    membershipRoles,
    setMemberRole,
    removeMember,
    privateBalances,
    setPrivateBalances,
    notificationStatus,
    scheduledReminders,
    requestReminderPermission,
    scheduleRecurringReminders,
    settlementMethod,
    setSettlementMethod,
    settlementReference,
    setSettlementReference,
    settlementStatus,
    setSettlementStatus,
    paymentMethods,
    paymentStatuses,
    cloudApiUrl,
    cloudSyncReady,
    lastCloudSync,
    lastCloudPush,
    pullCloudSync,
    resolveCloudConflict,
    upcomingRecurring,
    postRecurringOccurrence,
    cancelRecurring,
    syncState,
    membersForGroup,
    visibleExpenses,
    balances,
    friendBalanceSummaries,
    settlements,
    categoryTotals,
    trendTotals,
    currencyExposure,
    accountNotifications,
    unreadNotificationCount,
    markNotificationRead,
    markAllNotificationsRead,
    visibilitySummary,
    totalSpending,
    currencies,
    applyCurrencyConversion,
    memberName,
    memberPreferredPayment,
    addExpense,
    addSettlement,
    openPaymentHandoff,
    shareExport,
    shareBackup,
    restoreDemo,
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
      <StatusBar style="dark" />
      <XStack flex={1} bg="#f7f7f7">
        {isWideLayout ? (
          <DesktopNav
            activeTab={activeTab}
            onChange={handlePrimaryRouteChange}
            syncState={syncState}
            unreadNotificationCount={unreadNotificationCount}
          />
        ) : null}
        <YStack flex={1} minWidth={0}>
          <Header
            route={currentRoute}
            selectedGroup={selectedGroup}
            syncState={syncState}
            onBack={hasRouteBack ? handleRouteBack : null}
            isWideLayout={isWideLayout}
          />
          <YStack flex={1} width="100%">
            <ScrollView
              key={currentRoute.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: isWideLayout ? 36 : 116,
                paddingTop: 18,
                paddingHorizontal: isWideLayout ? 32 : 16,
              }}
            >
              <YStack gap="$3" maxWidth={920} width="100%" alignSelf="center">
                {selectedExpense ? <ExpenseDetailScreen state={appState} /> : null}
                {!selectedExpense && activeTab === 'activity' && <ActivityScreen state={appState} />}
                {!selectedExpense && activeTab === 'groups' && (groupSettingsOpen ? <GroupSettingsScreen state={appState} /> : <GroupsScreen state={appState} />)}
                {!selectedExpense && activeTab === 'add' && <AddExpenseScreen state={appState} />}
                {!selectedExpense && activeTab === 'balances' && <BalancesScreen state={appState} />}
                {!selectedExpense && activeTab === 'settings' && <MoreScreen state={appState} />}
              </YStack>
            </ScrollView>
          </YStack>
        </YStack>
        {!isWideLayout ? <BottomNav activeTab={activeTab} onChange={handlePrimaryRouteChange} /> : null}
      </XStack>
    </SafeAreaView>
  )
}

function Header({ route, selectedGroup, syncState, onBack, isWideLayout }) {
  return (
    <YStack bg="#ffffff" borderBottomWidth={1} borderColor="#e5e5e5" px={isWideLayout ? '$5' : '$4'} pt="$3" pb="$3">
      <YStack maxWidth={920} width="100%" alignSelf="center" gap="$2">
        <XStack ai="center" jc="space-between" gap="$3">
          <XStack ai="center" gap="$3" flex={1} minWidth={0}>
            {onBack ? (
              <Button
                unstyled
                h={38}
                w={38}
                ai="center"
                jc="center"
                br="$2"
                borderWidth={1}
                borderColor="#e4e4e7"
                bg="#ffffff"
                onPress={onBack}
                pressStyle={{ bg: '#f4f4f5', scale: 0.98 }}
              >
                <ArrowLeft size={18} color="#09090b" />
              </Button>
            ) : null}
            <YStack flex={1} minWidth={0}>
              <SizableText color="#71717a" size="$2" fontWeight="800" textTransform="uppercase">
                {route.section}
              </SizableText>
              <Text color="#09090b" fontSize={isWideLayout ? 25 : 23} lineHeight={isWideLayout ? 30 : 28} fontWeight="900" numberOfLines={1}>
                {route.title}
              </Text>
              <SizableText color="#71717a" size="$2" lineHeight={17} numberOfLines={isWideLayout ? 1 : 2}>
                {route.description}
              </SizableText>
            </YStack>
          </XStack>
          <YStack ai="flex-end" display={isWideLayout ? 'flex' : 'none'}>
            <SizableText color="#71717a" size="$2" fontWeight="800" textTransform="uppercase">
              Context
            </SizableText>
            <SizableText color="#09090b" size="$3" fontWeight="900">
              {selectedGroup?.name ?? 'Non-group'}
            </SizableText>
            <SizableText color="#71717a" size="$2">
              {syncState}
            </SizableText>
          </YStack>
        </XStack>
      </YStack>
    </YStack>
  )
}

function buildRouteMeta({ activeTab, moreSection, selectedExpense, selectedGroup, groupSettingsOpen }) {
  if (selectedExpense) {
    return {
      id: `expense-${selectedExpense.id}`,
      section: 'Expense',
      title: selectedExpense.description,
      description: 'Edit details, comments, receipt items, delete/restore state, and audit history.',
    }
  }
  if (groupSettingsOpen) {
    return {
      id: `group-settings-${selectedGroup?.id ?? 'none'}`,
      section: 'Groups',
      title: 'Group settings',
      description: 'Default split rules, settle-up behavior, and group-level controls.',
    }
  }
  if (activeTab === 'settings' && moreSection !== 'index') {
    const destination = moreDestinations.find((item) => item.id === moreSection)
    return {
      id: `more-${moreSection}`,
      section: 'More',
      title: destination?.label ?? 'More',
      description: destination?.description ?? 'Account, sync, exports, receipts, recurring bills, and app controls.',
    }
  }
  if (activeTab === 'groups') {
    return {
      id: 'groups',
      section: 'Workspace',
      title: 'Groups',
      description: 'Choose a group, manage members and invites, then tune defaults.',
    }
  }
  if (activeTab === 'add') {
    return {
      id: 'add',
      section: 'Create',
      title: 'Add expense',
      description: 'Move through basics, payers, split rules, receipt review, and final posting.',
    }
  }
  if (activeTab === 'balances') {
    return {
      id: 'balances',
      section: 'Settle',
      title: 'Balances',
      description: 'Review group and friend balances, simplify debt, and record payments.',
    }
  }
  if (activeTab === 'settings') {
    return {
      id: 'more',
      section: 'Workspace',
      title: 'More',
      description: 'Account, notification, privacy, currency, recurring, analytics, and tools.',
    }
  }
  return {
    id: 'activity',
    section: 'Workspace',
    title: 'Activity',
    description: 'Search the ledger, open expenses, and review the latest spending changes.',
  }
}

function buildSplitPreview(amount, splitMode, participants, splitValues = {}) {
  if (!participants.length || Number.isNaN(amount) || amount <= 0) {
    return { valid: false, message: 'Enter a valid amount', splits: [], preview: [] }
  }

  if (splitMode === 'equal') {
    const preview = distributePreview(
      participants.map((memberId) => ({ memberId, amount: amount / participants.length })),
      amount,
    )
    return { valid: true, message: 'Balanced', splits: [], preview }
  }

  if (splitMode === 'percent') {
    const splits = valuesToSplits(splitValuesWithFallback(splitValues, splitMode, participants, amount), participants)
    const total = roundMoney(splits.reduce((sum, split) => sum + split.value, 0))
    const preview = distributePreview(
      splits.map((split) => ({ memberId: split.memberId, amount: amount * (split.value / 100) })),
      amount,
    )
    return { valid: total === 100, message: total === 100 ? '100% allocated' : `${total}% allocated`, splits, preview }
  }

  if (splitMode === 'shares') {
    const splits = valuesToSplits(splitValuesWithFallback(splitValues, splitMode, participants, amount), participants)
    const totalShares = splits.reduce((sum, split) => sum + split.value, 0)
    const preview = distributePreview(
      splits.map((split) => ({ memberId: split.memberId, amount: amount * (split.value / totalShares) })),
      amount,
    )
    return { valid: totalShares > 0, message: `${totalShares} shares`, splits, preview }
  }

  const splits = valuesToSplits(splitValuesWithFallback(splitValues, splitMode, participants, amount), participants)
  const preview = splits.map((split) => ({ memberId: split.memberId, amount: roundMoney(split.value) }))
  const total = roundMoney(splits.reduce((sum, split) => sum + split.value, 0))
  return {
    valid: total === roundMoney(amount),
    message: total === roundMoney(amount) ? 'Exact total matches' : `${total.toFixed(2)} allocated`,
    splits,
    preview,
  }
}

function distributePreview(shares, expected) {
  const rounded = shares.map((share) => ({ ...share, amount: roundMoney(share.amount) }))
  const difference = roundMoney(expected - rounded.reduce((sum, share) => sum + share.amount, 0))
  if (rounded.length > 0 && difference !== 0) {
    rounded[0] = { ...rounded[0], amount: roundMoney(rounded[0].amount + difference) }
  }
  return rounded
}

function generatedSplitValues(splitMode, participants, amount) {
  if (splitMode === 'percent') {
    return Object.fromEntries(participants.map((memberId, index) => [memberId, String(roundMoney(index === 0 ? 40 : 60 / Math.max(participants.length - 1, 1)))]))
  }
  if (splitMode === 'shares') {
    return Object.fromEntries(participants.map((memberId, index) => [memberId, String(index === 0 ? 2 : 1)]))
  }
  const preview = distributePreview(participants.map((memberId) => ({ memberId, amount: amount / participants.length })), amount)
  return Object.fromEntries(preview.map((share) => [share.memberId, String(share.amount)]))
}

function splitValuesWithFallback(values, splitMode, participants, amount) {
  const fallback = generatedSplitValues(splitMode, participants, amount)
  return Object.fromEntries(participants.map((memberId) => [memberId, values[memberId] ?? fallback[memberId] ?? '0']))
}

function ensureSplitValues(splitMode, participants, amount, values = {}) {
  if (splitMode === 'equal') return {}
  return splitValuesWithFallback(values, splitMode, participants, amount)
}

function splitsToValues(splits, participants, splitMode, amount) {
  if (splitMode === 'equal') return {}
  return ensureSplitValues(
    splitMode,
    participants,
    amount,
    Object.fromEntries(splits.map((split) => [split.memberId, String(split.value)])),
  )
}

function valuesToSplits(values, participants) {
  return participants.map((memberId) => ({ memberId, value: roundMoney(Number(values[memberId] || 0)) }))
}

function payerValuesWithFallback(values, participants, amount, paidBy) {
  return Object.fromEntries(participants.map((memberId) => [memberId, values[memberId] ?? (memberId === paidBy ? String(roundMoney(amount)) : '0')]))
}

function defaultValueUnit(splitMode) {
  if (splitMode === 'percent') return 'Percent'
  if (splitMode === 'shares') return 'Shares'
  return 'Amount'
}

function downloadTextFile(fileName, contents, mimeType) {
  if (typeof document === 'undefined') return
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function replaceRecord(records, nextRecord) {
  return records.map((record) => (record.id === nextRecord.id ? nextRecord : record))
}

function expenseRevision(expense) {
  return expense?.updatedAt ?? expense?.deletedAt ?? expense?.history?.[0]?.createdAt ?? expense?.date
}

function syncSummaryWithConflicts(summary, conflicts) {
  return {
    ...summary,
    conflicts,
    memberConflicts: conflicts.filter((conflict) => conflict.entity === 'member').length,
    groupConflicts: conflicts.filter((conflict) => conflict.entity === 'group').length,
    expenseConflicts: conflicts.filter((conflict) => conflict.entity === 'expense').length,
  }
}

function ActivityScreen({ state }) {
  return (
    <>
      <Panel>
        <XStack ai="center" gap="$2" bg="#f4f4f5" br="$2" px="$3" h={44} borderWidth={1} borderColor="#e4e4e7">
          <Search size={17} color="#71717a" />
          <Input
            unstyled
            value={state.query}
            onChangeText={state.setQuery}
            placeholder="Search expenses, notes, category, currency"
            color="#09090b"
            flex={1}
            fontSize={15}
          />
          <ListFilter size={17} color="#71717a" />
        </XStack>
      </Panel>

      <Panel title="Recent activity" actionLabel="Add" onAction={() => state.setActiveTab('add')}>
        {state.visibleExpenses.slice(0, 8).map((expense) => (
          <ExpenseRow key={expense.id} expense={expense} onPress={() => state.openExpense(expense)} />
        ))}
      </Panel>
    </>
  )
}

function ExpenseDetailScreen({ state }) {
  const expense = state.selectedExpense
  if (!expense) return null
  const comments = expense.comments ?? []
  const history = expense.history ?? []
  return (
    <>
      <Panel title={expense.description} actionLabel="Back" onAction={state.closeExpense}>
        <YStack gap="$3">
          <XStack ai="center" jc="space-between" gap="$3">
            <YStack flex={1}>
              <Muted>
                {expense.category} · {expense.kind} · {expense.date}
              </Muted>
              <Text color="#09090b" fontSize={28} lineHeight={34} fontWeight="900">
                {expense.currency} {expense.amount.toFixed(2)}
              </Text>
            </YStack>
            <YStack ai="flex-end">
              <SizableText color="#09090b" size="$2" fontWeight="900">
                {expense.deletedAt ? 'Deleted' : 'Active'}
              </SizableText>
              <Muted>{expense.splitMode} split</Muted>
            </YStack>
          </XStack>
          <FeatureList
            rows={[
              ['Paid by', state.memberName(expense.paidBy)],
              ['Payer shares', expense.payments?.length ? expense.payments.map((payment) => `${state.memberName(payment.memberId)} ${expense.currency} ${payment.value.toFixed(2)}`).join(', ') : 'Single payer'],
              ['Participants', expense.participants.map(state.memberName).join(', ')],
              ['Notes', expense.notes ?? 'No notes'],
              ['Attachment', expense.attachmentName ?? 'No attachment'],
              ...(expense.paymentMethod
                ? [
                    ['Payment', `${expense.paymentMethod} · ${expense.paymentStatus ?? 'recorded'}`],
                    ['Reference', expense.paymentReference ?? 'No reference'],
                  ]
                : []),
            ]}
          />
          {expense.receiptItems?.length ? (
            <YStack gap="$2">
              <Label>Receipt items</Label>
              {expense.receiptItems.map((item) => (
                <XStack key={item.id} jc="space-between" py="$2" borderBottomWidth={1} borderColor="#f4f4f5">
                  <YStack flex={1}>
                    <Text color="#09090b" fontSize={14} fontWeight="900">
                      {item.label}
                    </Text>
                    <Muted>{item.assignedTo.map(state.memberName).join(', ')}</Muted>
                  </YStack>
                  <SizableText color="#09090b" size="$2" fontWeight="900">
                    {expense.currency} {item.amount.toFixed(2)}
                  </SizableText>
                </XStack>
              ))}
            </YStack>
          ) : null}
        </YStack>
      </Panel>

      <Panel title="Edit expense">
        <YStack gap="$3">
          <Field label="Description">
            <Input value={state.detailDescription} onChangeText={state.setDetailDescription} placeholder="Description" {...inputProps} />
          </Field>
          <Field label="Amount">
            <Input value={state.detailAmount} onChangeText={state.setDetailAmount} keyboardType="decimal-pad" placeholder="0.00" {...inputProps} />
          </Field>
          <XStack gap="$2" fw="wrap">
            <SecondaryButton icon={<Pencil size={16} color="#09090b" />} label="Save edit" onPress={state.updateSelectedExpense} />
            {expense.deletedAt ? (
              <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label="Restore" onPress={state.restoreSelectedExpense} />
            ) : (
              <SecondaryButton icon={<Trash2 size={16} color="#09090b" />} label="Delete" onPress={state.deleteSelectedExpense} />
            )}
          </XStack>
        </YStack>
      </Panel>

      <Panel title="Comments">
        <YStack gap="$3">
          <Field label="New comment">
            <Input value={state.commentDraft} onChangeText={state.setCommentDraft} placeholder="Add a note for everyone on this expense" {...inputProps} />
          </Field>
          <SecondaryButton icon={<MessageCircle size={16} color="#09090b" />} label="Add comment" onPress={state.addExpenseComment} />
          {comments.length ? comments.map((comment) => (
            <XStack key={comment.id} gap="$2.5" py="$2.5" borderBottomWidth={1} borderColor="#f4f4f5">
              <YStack ai="center" jc="center" h={34} w={34} br={999} bg="#f4f4f5">
                <SizableText color="#09090b" size="$1" fontWeight="900">
                  {state.memberName(comment.memberId).slice(0, 2).toUpperCase()}
                </SizableText>
              </YStack>
              <YStack flex={1}>
                <Text color="#09090b" fontSize={14} fontWeight="900">
                  {state.memberName(comment.memberId)}
                </Text>
                <Muted>{comment.body}</Muted>
              </YStack>
            </XStack>
          )) : <Muted>No comments yet.</Muted>}
        </YStack>
      </Panel>

      <Panel title="History">
        <YStack gap="$2">
          {history.length ? history.map((event) => (
            <XStack key={event.id} jc="space-between" gap="$3" py="$2" borderBottomWidth={1} borderColor="#f4f4f5">
              <YStack flex={1}>
                <Text color="#09090b" fontSize={14} fontWeight="900">
                  {event.summary}
                </Text>
                <Muted>{event.memberId ? state.memberName(event.memberId) : 'System'}</Muted>
              </YStack>
              <Muted>{new Date(event.createdAt).toLocaleDateString()}</Muted>
            </XStack>
          )) : <Muted>No history yet.</Muted>}
        </YStack>
      </Panel>
    </>
  )
}

function GroupsScreen({ state }) {
  return (
    <>
      <Panel title="Groups">
        <YStack gap="$2">
          <GroupButton label="Non-group expenses" active={state.selectedGroupId === null} onPress={() => state.setSelectedGroupId(null)} />
          {state.activeGroups.map((group) => (
            <GroupButton
              key={group.id}
              label={group.name}
              meta={`${group.memberIds.length} members · ${group.defaultCurrency}`}
              active={state.selectedGroupId === group.id}
              onPress={() => state.setSelectedGroupId(group.id)}
            />
          ))}
        </YStack>
      </Panel>

      <Panel title="Workspace">
        <XStack gap="$1.5" fw="wrap">
          {groupViews.map((view) => (
            <Chip key={view.id} label={view.label} active={state.groupView === view.id} onPress={() => state.setGroupView(view.id)} />
          ))}
        </XStack>
      </Panel>

      {state.groupView === 'overview' && state.selectedGroup ? (
        <Panel title="Overview">
          <YStack gap="$3">
            <FeatureList rows={[
              ['Group', `${state.selectedGroup.name} · ${state.selectedGroup.memberIds.length} members`],
              ['Default split', `${state.selectedGroup.defaultSplitMode} for new expenses.`],
              ['Settle-up mode', state.selectedGroup.simplifyDebts ? 'Simplified debts are on.' : 'Direct pairwise debts are on.'],
              ['Restore path', 'Deleted groups are restored from More > Tools.'],
            ]} />
            <XStack gap="$2" fw="wrap">
              <SecondaryButton icon={<Settings size={16} color="#09090b" />} label="Settings" onPress={state.openGroupSettings} />
              <SecondaryButton icon={<Trash2 size={16} color="#09090b" />} label="Delete group" onPress={state.deleteSelectedGroup} />
            </XStack>
          </YStack>
        </Panel>
      ) : null}

      {state.groupView === 'overview' && !state.selectedGroup ? (
        <Panel title="Overview">
          <FeatureList rows={[
            ['Scope', 'Non-group expenses'],
            ['Visibility', 'Only involved people see private expense details.'],
            ['Members shown', `${state.membersForGroup.length} people available for one-off bills.`],
          ]} />
        </Panel>
      ) : null}

      {state.groupView === 'friends' ? (
        <>
          <Panel title="Friends">
            <XStack fw="wrap" gap="$2">
              {state.membersForGroup.map((member) => (
                <YStack key={member.id} width="48.5%" minWidth={150} bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
                  <XStack ai="center" gap="$2">
                    <YStack ai="center" jc="center" h={34} w={34} br={999} bg="#f4f4f5">
                      <SizableText color="#09090b" size="$2" fontWeight="900">
                        {member.avatar}
                      </SizableText>
                    </YStack>
                    <YStack flex={1}>
                      <Text color="#09090b" fontSize={15} fontWeight="900">
                        {member.name}
                      </Text>
                      <Muted>{member.preferredPayment}</Muted>
                    </YStack>
                  </XStack>
                </YStack>
              ))}
            </XStack>
          </Panel>

          <Panel title="Add friend">
            <YStack gap="$3">
              <Field label="Name">
                <Input value={state.friendName} onChangeText={state.setFriendName} placeholder="Friend name" {...inputProps} />
              </Field>
              <Field label="Email or phone">
                <Input value={state.friendEmail} onChangeText={state.setFriendEmail} placeholder="friend@example.com" {...inputProps} />
              </Field>
              <SecondaryButton icon={<Users size={16} color="#09090b" />} label="Save friend" onPress={state.addFriend} />
            </YStack>
          </Panel>
        </>
      ) : null}

      {state.groupView === 'invites' && !state.selectedGroup ? (
        <>
          <InviteLinkPanel state={state} />
          <Panel title="Invites">
            <FeatureList rows={[
              ['Scope', 'Select a group to manage invites and roles.'],
              ['Non-group expenses', 'Private one-off bills do not have group roles.'],
            ]} />
          </Panel>
        </>
      ) : null}

      {state.groupView === 'invites' && state.selectedGroup ? (
        <YStack gap="$3">
          <InviteLinkPanel state={state} />
          <Panel title="Invites">
            <YStack gap="$3">
              <Field label="Invite email">
                <Input value={state.inviteEmail} onChangeText={state.setInviteEmail} placeholder="name@example.com" {...inputProps} />
              </Field>
              <Field label="Invite role">
                <XStack gap="$1.5" fw="wrap">
                  {groupRoles.map((role) => (
                    <Chip key={role} label={role} active={state.inviteRole === role} onPress={() => state.setInviteRole(role)} />
                  ))}
                </XStack>
              </Field>
              <PrimaryButton icon={<Plus size={17} color="#ffffff" />} label="Create invite" onPress={state.createInvite} />
              {state.pendingInvites.map((invite) => (
                <XStack key={invite.id} ai="center" jc="space-between" gap="$3" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
                  <YStack flex={1}>
                    <Text color="#09090b" fontSize={14} fontWeight="900">
                      {invite.invitedEmail}
                    </Text>
                    <Muted>
                      {invite.role} · {invite.status}
                      {invite.acceptedBy ? ` by ${state.memberName(invite.acceptedBy)}` : ''} · {invite.token}
                    </Muted>
                  </YStack>
                  <XStack gap="$2" fw="wrap" jc="flex-end">
                    <SecondaryButton icon={<Share2 size={16} color="#09090b" />} label="Share" onPress={() => state.shareInvite(invite.id)} />
                    {invite.status === 'pending' ? (
                      <SecondaryButton icon={<Check size={16} color="#09090b" />} label="Accept" onPress={() => state.acceptInvite(invite.id)} />
                    ) : null}
                  </XStack>
                </XStack>
              ))}
              {state.pendingInvites.length === 0 ? <Muted>No pending invites.</Muted> : null}
            </YStack>
          </Panel>

          <Panel title="Member roles">
            <YStack gap="$2">
              {state.membersForGroup.map((member) => (
                <YStack key={member.id} bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3" gap="$2">
                  <XStack jc="space-between" ai="center">
                    <YStack flex={1}>
                      <Text color="#09090b" fontSize={15} fontWeight="900">
                        {member.name}
                      </Text>
                      <Muted>
                        {Math.abs(state.balances.find((balance) => balance.memberId === member.id)?.amount ?? 0) >= 0.01
                          ? 'Settle before removing'
                          : 'No group balance'}
                      </Muted>
                    </YStack>
                    <Button unstyled onPress={() => state.removeMember(member.id)}>
                      <SizableText color="#71717a" size="$2" fontWeight="900">
                        Remove
                      </SizableText>
                    </Button>
                  </XStack>
                  <XStack gap="$1.5" fw="wrap">
                    {groupRoles.map((role) => (
                      <Chip
                        key={role}
                        label={role}
                        active={(state.membershipRoles[state.selectedGroupId]?.[member.id] ?? 'member') === role}
                        onPress={() => state.setMemberRole(member.id, role)}
                      />
                    ))}
                  </XStack>
                </YStack>
              ))}
            </YStack>
          </Panel>
        </YStack>
      ) : null}
    </>
  )
}

function InviteLinkPanel({ state }) {
  return (
    <Panel title="Open invite link">
      <YStack gap="$3">
        <Field label="Invite token or link">
          <Input
            value={state.inviteTokenInput}
            onChangeText={state.setInviteTokenInput}
            placeholder="splitclub://invite/join_..."
            autoCapitalize="none"
            {...inputProps}
          />
        </Field>
        <XStack gap="$2" fw="wrap">
          <SecondaryButton icon={<Check size={16} color="#09090b" />} label="Accept invite" onPress={state.acceptInviteToken} />
        </XStack>
        <Muted>{state.inviteLinkStatus}</Muted>
      </YStack>
    </Panel>
  )
}

function GroupSettingsScreen({ state }) {
  const group = state.selectedGroup
  if (!group) return null
  const showValues = state.groupDefaultMode !== 'equal'
  return (
    <>
      <Panel title={group.name} actionLabel="Groups" onAction={state.closeGroupSettings}>
        <FeatureList rows={[
          ['Default split', 'Saved defaults are applied when this group starts a new expense.'],
          ['Settle-up mode', group.simplifyDebts ? 'Simplified debts reduce payment count.' : 'Direct debts preserve pairwise IOUs.'],
          ['Members', `${state.membersForGroup.length} people use this pattern.`],
          ['Currency', `${group.defaultCurrency} remains the group default currency.`],
        ]} />
      </Panel>

      <Panel title="Settle-up mode">
        <YStack gap="$3">
          <XStack gap="$1.5" fw="wrap">
            <Chip label="Simplified" active={state.groupSimplifyDebts} onPress={() => state.setGroupSimplifyDebts(true)} />
            <Chip label="Direct" active={!state.groupSimplifyDebts} onPress={() => state.setGroupSimplifyDebts(false)} />
          </XStack>
          <Muted>
            {state.groupSimplifyDebts
              ? "SplitClub will reduce the number of payments while preserving everyone's net balance."
              : 'SplitClub will keep settle-up suggestions tied to the original pairwise debts.'}
          </Muted>
        </YStack>
      </Panel>

      <Panel title="Default split method" actionLabel="Save" onAction={state.saveGroupDefaults}>
        <YStack gap="$3">
          <XStack gap="$1.5" fw="wrap">
            {splitModes.map((mode) => (
              <Chip key={mode} label={mode} active={state.groupDefaultMode === mode} onPress={() => state.setGroupDefaultModeValue(mode)} />
            ))}
          </XStack>
          {showValues ? (
            <YStack gap="$2">
              {state.membersForGroup.map((member) => (
                <XStack key={member.id} ai="center" gap="$2" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
                  <YStack flex={1}>
                    <Text color="#09090b" fontSize={14} fontWeight="900">
                      {member.name}
                    </Text>
                    <Muted>{defaultValueUnit(state.groupDefaultMode)}</Muted>
                  </YStack>
                  <Input
                    value={state.groupDefaultValues[member.id] ?? ''}
                    onChangeText={(value) => state.setGroupDefaultValue(member.id, value)}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    width={112}
                    {...inputProps}
                  />
                </XStack>
              ))}
            </YStack>
          ) : (
            <Muted>Equal defaults divide the bill across every current group member.</Muted>
          )}
          <YStack bg={state.groupDefaultValidation.valid ? '#fafafa' : '#fff1f2'} borderWidth={1} borderColor={state.groupDefaultValidation.valid ? '#e4e4e7' : '#fecdd3'} br="$2" p="$3">
            <SizableText color={state.groupDefaultValidation.valid ? '#09090b' : '#be123c'} size="$2" fontWeight="900">
              {state.groupDefaultValidation.message}
            </SizableText>
          </YStack>
          <PrimaryButton icon={<Check size={17} color="#ffffff" />} label="Save defaults" onPress={state.saveGroupDefaults} />
        </YStack>
      </Panel>
    </>
  )
}

function AddExpenseScreen({ state }) {
  return (
    <>
      <Panel title="Expense flow">
        <XStack gap="$1.5" fw="wrap">
          {addExpenseSteps.map((step) => (
            <Chip key={step.id} label={step.label} active={state.addExpenseStep === step.id} onPress={() => state.setAddExpenseStep(step.id)} />
          ))}
        </XStack>
      </Panel>

      {state.addExpenseStep === 'basics' ? (
        <Panel title="Basics">
          <YStack gap="$3">
            <Field label="Type">
              <XStack gap="$1.5" fw="wrap">
                {expenseKinds.map((kind) => (
                  <Chip key={kind} label={kind} active={state.expenseKind === kind} onPress={() => state.setExpenseKind(kind)} />
                ))}
              </XStack>
            </Field>
            <Field label="Description">
              <Input value={state.description} onChangeText={state.setDescription} placeholder="What was this for?" {...inputProps} />
            </Field>
            <XStack gap="$2" fw="wrap">
              <YStack flex={1} minWidth={180} gap="$2">
                <Label>Amount</Label>
                <Input value={state.amount} onChangeText={state.setAmount} keyboardType="decimal-pad" placeholder="0.00" {...inputProps} />
              </YStack>
              <YStack flex={1} minWidth={180} gap="$2">
                <Label>Currency</Label>
                <XStack gap="$1.5" fw="wrap">
                  {currencies.map((code) => (
                    <Chip key={code} label={code} active={state.currency === code} onPress={() => state.setCurrency(code)} />
                  ))}
                </XStack>
              </YStack>
            </XStack>
            <Field label="Category">
              <XStack gap="$1.5" fw="wrap">
                {categories.map((category) => (
                  <Chip key={category} label={category} active={state.category === category} onPress={() => state.setCategory(category)} />
                ))}
              </XStack>
            </Field>
            <Field label="Date">
              <Input value={state.date} onChangeText={state.setDate} placeholder="YYYY-MM-DD" {...inputProps} />
            </Field>
            <Field label="Recurring bill">
              <XStack gap="$1.5" fw="wrap">
                {recurrenceOptions.map((option) => (
                  <Chip key={option} label={option} active={state.recurrence === option} onPress={() => state.setRecurrence(option)} />
                ))}
              </XStack>
            </Field>
            {state.recurrence !== 'none' ? (
              <Field label="Reminder days before due date">
                <Input value={state.reminderDays} onChangeText={state.setReminderDays} keyboardType="number-pad" placeholder="3" {...inputProps} />
              </Field>
            ) : null}
            <Field label="Notes">
              <Input value={state.notes} onChangeText={state.setNotes} placeholder="Internal note, memo, or reminder context" {...inputProps} />
            </Field>
          </YStack>
        </Panel>
      ) : null}

      {state.addExpenseStep === 'payers' ? (
        <Panel title="Payers">
          <YStack gap="$3">
            <Field label="Paid by">
              <XStack gap="$1.5" fw="wrap">
                {state.membersForGroup.map((member) => (
                  <Chip key={member.id} label={member.name} active={state.paidBy === member.id} onPress={() => state.setPaidBy(member.id)} />
                ))}
              </XStack>
            </Field>
            <Field label="Payer mode">
              <XStack gap="$1.5" fw="wrap">
                <Chip label="single" active={state.payerMode === 'single'} onPress={() => state.setPayerMode('single')} />
                <Chip label="multiple" active={state.payerMode === 'multiple'} onPress={() => state.setPayerMode('multiple')} />
              </XStack>
            </Field>
            {state.payerMode === 'multiple' ? (
              <YStack gap="$2">
                <Label>Paid amounts</Label>
                {state.membersForGroup.map((member) => (
                  <XStack key={member.id} ai="center" gap="$2" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
                    <YStack flex={1}>
                      <Text color="#09090b" fontSize={14} fontWeight="900">
                        {member.name}
                      </Text>
                      <Muted>Amount paid</Muted>
                    </YStack>
                    <Input
                      value={state.payerValues[member.id] ?? ''}
                      onChangeText={(value) => state.setExpensePayerValue(member.id, value)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      width={112}
                      {...inputProps}
                    />
                  </XStack>
                ))}
              </YStack>
            ) : null}
            <YStack bg={state.payerValidation.valid ? '#fafafa' : '#fff1f2'} borderWidth={1} borderColor={state.payerValidation.valid ? '#e4e4e7' : '#fecdd3'} br="$2" p="$3">
              <SizableText color={state.payerValidation.valid ? '#09090b' : '#be123c'} size="$2" fontWeight="900">
                {state.payerValidation.message}
              </SizableText>
            </YStack>
          </YStack>
        </Panel>
      ) : null}

      {state.addExpenseStep === 'split' ? (
        <Panel title="Split">
          <YStack gap="$3">
            <Field label="Split method">
              <XStack gap="$1.5" fw="wrap">
                {splitModes.map((mode) => (
                  <Chip key={mode} label={mode} active={state.splitMode === mode} onPress={() => state.setSplitMode(mode)} />
                ))}
              </XStack>
            </Field>
            {state.selectedGroup ? (
              <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label="Use group defaults" onPress={() => state.applyGroupDefaultsToExpense()} />
            ) : null}
            {state.splitMode !== 'equal' ? (
              <YStack gap="$2">
                <Label>Split values</Label>
                {state.membersForGroup.map((member) => (
                  <XStack key={member.id} ai="center" gap="$2" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
                    <YStack flex={1}>
                      <Text color="#09090b" fontSize={14} fontWeight="900">
                        {member.name}
                      </Text>
                      <Muted>{defaultValueUnit(state.splitMode)}</Muted>
                    </YStack>
                    <Input
                      value={state.splitValues[member.id] ?? ''}
                      onChangeText={(value) => state.setExpenseSplitValue(member.id, value)}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      width={112}
                      {...inputProps}
                    />
                  </XStack>
                ))}
              </YStack>
            ) : null}
            <YStack bg="#f4f4f5" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3" gap="$2">
              <Label>Participants</Label>
              <XStack fw="wrap" gap="$2">
                {state.membersForGroup.map((member) => (
                  <SizableText key={member.id} color="#18181b" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br={999} px="$3" py="$2" size="$2" fontWeight="800">
                    {member.name}
                  </SizableText>
                ))}
              </XStack>
            </YStack>
            <YStack bg={state.splitPreview.valid ? '#fafafa' : '#fff1f2'} borderWidth={1} borderColor={state.splitPreview.valid ? '#e4e4e7' : '#fecdd3'} br="$2" p="$3" gap="$2">
              <XStack ai="center" jc="space-between">
                <Label>Split validation</Label>
                <SizableText color={state.splitPreview.valid ? '#09090b' : '#be123c'} size="$2" fontWeight="900">
                  {state.splitPreview.message}
                </SizableText>
              </XStack>
              {state.splitPreview.preview.map((share) => (
                <XStack key={share.memberId} jc="space-between">
                  <Muted>{state.memberName(share.memberId)}</Muted>
                  <SizableText color="#09090b" size="$2" fontWeight="900">
                    {state.currency} {share.amount.toFixed(2)}
                  </SizableText>
                </XStack>
              ))}
            </YStack>
          </YStack>
        </Panel>
      ) : null}

      {state.addExpenseStep === 'receipt' ? (
        <Panel title="Receipt itemization">
        <YStack gap="$3">
          <Field label="Attachment">
            <Input value={state.attachmentName} onChangeText={state.setAttachmentName} placeholder="receipt.jpg" {...inputProps} />
          </Field>
          <YStack bg="#f4f4f5" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3" gap="$2">
            <XStack ai="center" jc="space-between" gap="$3">
              <YStack flex={1}>
                <Text color="#09090b" fontSize={14} fontWeight="900">
                  {state.receiptFile?.name ?? 'No receipt selected'}
                </Text>
                <Muted>{state.receiptFile ? `${state.receiptFile.mimeType ?? 'file'} · ${state.receiptFile.size ?? 0} bytes` : 'Images and PDFs work on Android and web.'}</Muted>
              </YStack>
              <Camera size={18} color="#09090b" />
            </XStack>
            <XStack gap="$2" fw="wrap">
              <SecondaryButton icon={<Camera size={16} color="#09090b" />} label="Choose" onPress={state.chooseReceipt} />
              <SecondaryButton icon={<ReceiptText size={16} color="#09090b" />} label="Upload OCR" onPress={state.uploadReceipt} />
            </XStack>
          </YStack>
          <YStack bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3" gap="$2">
            <XStack ai="center" jc="space-between" gap="$3">
              <YStack flex={1}>
                <Text color="#09090b" fontSize={14} fontWeight="900">
                  Cloud receipt library
                </Text>
                <Muted>{state.receiptLibraryStatus}</Muted>
              </YStack>
              <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label="Load" onPress={state.loadCloudReceipts} />
            </XStack>
            {state.cloudReceipts.slice(0, 3).map((receipt) => (
              <XStack key={receipt.id} ai="center" jc="space-between" gap="$3" py="$2" borderTopWidth={1} borderColor="#f4f4f5">
                <YStack flex={1}>
                  <Text color="#09090b" fontSize={14} fontWeight="900">
                    {receipt.fileName}
                  </Text>
                  <Muted>
                    {receipt.ocrStatus} · {receipt.extractedItems?.length ?? 0} items · {new Date(receipt.createdAt).toLocaleDateString()}
                  </Muted>
                </YStack>
                <Button unstyled onPress={() => state.applyCloudReceipt(receipt.id)}>
                  <SizableText color="#09090b" size="$2" fontWeight="900">
                    Use
                  </SizableText>
                </Button>
              </XStack>
            ))}
          </YStack>
          <Field label="OCR text">
            <Input value={state.receiptOcrText} onChangeText={state.setReceiptOcrText} placeholder="Item name 12.34" {...inputProps} />
          </Field>
          <SecondaryButton icon={<ListFilter size={16} color="#09090b" />} label="Extract for review" onPress={state.extractReceiptPreview} />
          <XStack gap="$2" fw="wrap">
            <YStack flex={1} minWidth={180} gap="$2">
              <Label>Item</Label>
              <Input value={state.itemLabel} onChangeText={state.setItemLabel} placeholder="Line item" {...inputProps} />
            </YStack>
            <YStack flex={1} minWidth={140} gap="$2">
              <Label>Amount</Label>
              <Input value={state.itemAmount} onChangeText={state.setItemAmount} keyboardType="decimal-pad" placeholder="0.00" {...inputProps} />
            </YStack>
          </XStack>
          <SecondaryButton icon={<Plus size={16} color="#09090b" />} label="Add receipt item" onPress={state.addReceiptItem} />
          <YStack gap="$2">
            {state.receiptItems.map((item) => (
              <YStack key={item.id} gap="$2" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
                <XStack ai="center" gap="$2">
                  <YStack flex={1}>
                    <Text color="#09090b" fontSize={14} fontWeight="900">
                      {item.label}
                    </Text>
                    <Muted>Assigned to {item.assignedTo.length ? item.assignedTo.map(state.memberName).join(', ') : 'everyone'}</Muted>
                  </YStack>
                  <SizableText color="#09090b" size="$3" fontWeight="900">
                    {state.currency} {Number(item.amount).toFixed(2)}
                  </SizableText>
                  <Button unstyled onPress={() => state.removeReceiptItem(item.id)}>
                    <SizableText color="#71717a" size="$2" fontWeight="900">
                      Remove
                    </SizableText>
                  </Button>
                </XStack>
                <XStack gap="$1.5" fw="wrap">
                  {state.membersForGroup.map((member) => (
                    <Chip
                      key={member.id}
                      label={member.name}
                      active={item.assignedTo.includes(member.id) || item.assignedTo.length === 0}
                      onPress={() => state.toggleReceiptItemAssignment(item.id, member.id)}
                    />
                  ))}
                </XStack>
              </YStack>
            ))}
          </YStack>
          <YStack bg="#f4f4f5" br="$2" p="$3" gap="$2">
            <XStack ai="center" jc="space-between">
              <SizableText color="#3f3f46" size="$2" fontWeight="900">
                Itemized total
              </SizableText>
              <SizableText color="#09090b" size="$3" fontWeight="900">
                {state.currency} {state.itemizedTotal.toFixed(2)}
              </SizableText>
            </XStack>
            {state.itemizedSplits.map((split) => (
              <XStack key={split.memberId} jc="space-between">
                <Muted>{state.memberName(split.memberId)}</Muted>
                <SizableText color="#09090b" size="$2" fontWeight="900">
                  {state.currency} {split.value.toFixed(2)}
                </SizableText>
              </XStack>
            ))}
          </YStack>
          <SecondaryButton icon={<ListFilter size={16} color="#09090b" />} label="Use itemized split" onPress={state.applyItemizedSplit} />
        </YStack>
        </Panel>
      ) : null}

      {state.addExpenseStep === 'review' ? (
        <Panel title="Review">
          <YStack gap="$3">
            <FeatureList rows={[
              ['Description', state.description || 'Not set'],
              ['Amount', `${state.currency} ${Number(state.amount || 0).toFixed(2)}`],
              ['Type', `${state.expenseKind} · ${state.category}`],
              ['Paid by', state.memberName(state.paidBy)],
              ['Payers', state.payerValidation.message],
              ['Split', state.splitPreview.message],
              ['Receipt items', `${state.receiptItems.length} items · ${state.currency} ${state.itemizedTotal.toFixed(2)}`],
            ]} />
            <PrimaryButton icon={<Plus size={17} color="#ffffff" />} label="Save expense" onPress={state.addExpense} />
          </YStack>
        </Panel>
      ) : null}
    </>
  )
}

function BalancesScreen({ state }) {
  return (
    <>
      <Panel title="Friend totals">
        <YStack gap="$1">
          <Muted>Across active groups and private expenses.</Muted>
          {state.friendBalanceSummaries.length === 0 ? (
            <YStack py="$3">
              <Text color="#09090b" fontSize={15} fontWeight="900">
                All settled
              </Text>
              <Muted>No friend-level balances are open.</Muted>
            </YStack>
          ) : (
            state.friendBalanceSummaries.map((summary) => (
              <YStack key={summary.friendId} py="$3" borderBottomWidth={1} borderColor="#f4f4f5" gap="$2">
                <XStack ai="center" jc="space-between" gap="$3">
                  <YStack flex={1}>
                    <Text color="#09090b" fontSize={15} fontWeight="900">
                      {state.memberName(summary.friendId)}
                    </Text>
                    <Muted>{summary.amount >= 0 ? 'owes you overall' : 'you owe overall'}</Muted>
                  </YStack>
                  <Text color="#09090b" fontSize={15} fontWeight="900">
                    {summary.amount < 0 ? '-' : '+'}
                    {summary.currency} {Math.abs(summary.amount).toFixed(2)}
                  </Text>
                </XStack>
                <YStack gap="$1">
                  {summary.breakdown.map((item) => (
                    <XStack key={`${summary.friendId}-${item.scopeId ?? 'private'}`} ai="center" jc="space-between" gap="$3">
                      <Muted>{item.scopeName}</Muted>
                      <SizableText color="#52525b" size="$2" fontWeight="800">
                        {item.amount < 0 ? '-' : '+'}
                        {item.currency} {Math.abs(item.amount).toFixed(2)}
                      </SizableText>
                    </XStack>
                  ))}
                </YStack>
              </YStack>
            ))
          )}
        </YStack>
      </Panel>

      <Panel title="Net balances">
        {state.balances.map((balance) => (
          <XStack key={balance.memberId} ai="center" jc="space-between" py="$2.5" borderBottomWidth={1} borderColor="#f4f4f5">
            <YStack>
              <Text color="#09090b" fontSize={15} fontWeight="900">
                {state.memberName(balance.memberId)}
              </Text>
              <Muted>{balance.amount >= 0 ? 'gets back' : 'owes'}</Muted>
            </YStack>
            <Text color="#09090b" fontSize={15} fontWeight="900">
              {balance.amount < 0 ? '-' : '+'}
              {state.currency} {Math.abs(balance.amount).toFixed(2)}
            </Text>
          </XStack>
        ))}
      </Panel>

      <Panel title="Settle up">
        <YStack gap="$2">
          <Field label="Payment method">
            <XStack gap="$1.5" fw="wrap">
              {state.paymentMethods.map((method) => (
                <Chip key={method} label={method.toUpperCase()} active={state.settlementMethod === method} onPress={() => state.setSettlementMethod(method)} />
              ))}
            </XStack>
          </Field>
          <Field label="Payment status">
            <XStack gap="$1.5" fw="wrap">
              {state.paymentStatuses.map((status) => (
                <Chip key={status} label={status} active={state.settlementStatus === status} onPress={() => state.setSettlementStatus(status)} />
              ))}
            </XStack>
          </Field>
          <Field label="Reference">
            <Input value={state.settlementReference} onChangeText={state.setSettlementReference} placeholder="Payment handle, account note, or transaction reference" {...inputProps} />
          </Field>
          {state.settlements.map((settlement) => (
            <YStack key={`${settlement.from}-${settlement.to}-${settlement.amount}`} gap="$3" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
              <XStack ai="center" gap="$2">
                <Check size={16} color="#09090b" />
                <YStack flex={1}>
                  <SizableText color="#18181b" size="$3" fontWeight="800">
                    {state.memberName(settlement.from)} pays {state.memberName(settlement.to)}
                  </SizableText>
                  <Muted>{state.memberPreferredPayment(settlement.to)} preferred</Muted>
                </YStack>
                <SizableText color="#09090b" size="$3" fontWeight="900">
                  {settlement.currency} {settlement.amount.toFixed(2)}
                </SizableText>
              </XStack>
              <XStack gap="$2">
                <SecondaryButton icon={<ChevronRight size={16} color="#09090b" />} label="Open payment" onPress={() => state.openPaymentHandoff(settlement)} />
                <SecondaryButton icon={<Check size={16} color="#09090b" />} label="Record" onPress={() => state.addSettlement(settlement.from, settlement.to, settlement.amount)} />
              </XStack>
            </YStack>
          ))}
        </YStack>
      </Panel>
    </>
  )
}

function MoreScreen({ state }) {
  const selectedDestination = moreDestinations.find((item) => item.id === state.moreSection)
  if (selectedDestination) {
    return (
      <>
        <Panel title={selectedDestination.label} actionLabel="More" onAction={() => state.setMoreSection('index')}>
          <Muted>{selectedDestination.description}</Muted>
        </Panel>
        {state.moreSection === 'account' ? <AccountScreen state={state} /> : null}
        {state.moreSection === 'notifications' ? <NotificationsScreen state={state} /> : null}
        {state.moreSection === 'privacy' ? <PrivacyScreen state={state} /> : null}
        {state.moreSection === 'currencies' ? <CurrenciesScreen state={state} /> : null}
        {state.moreSection === 'recurring' ? <RecurringBillsScreen state={state} /> : null}
        {state.moreSection === 'analytics' ? <AnalyticsScreen state={state} /> : null}
        {state.moreSection === 'tools' ? <ToolsScreen state={state} /> : null}
      </>
    )
  }

  return (
    <Panel title="More">
      <YStack gap="$2">
        {moreDestinations.map((item) => {
          const Icon = item.icon
          return (
            <Button key={item.id} unstyled onPress={() => state.setMoreSection(item.id)}>
              <XStack ai="center" gap="$3" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
                <YStack ai="center" jc="center" h={38} w={38} br={999} bg="#f4f4f5">
                  <Icon size={18} color="#09090b" />
                </YStack>
                <YStack flex={1}>
                  <Text color="#09090b" fontSize={15} fontWeight="900">
                    {item.label}
                  </Text>
                  <SizableText color="#71717a" size="$2" lineHeight={17}>
                    {item.description}
                  </SizableText>
                </YStack>
                <ChevronRight size={17} color="#71717a" />
              </XStack>
            </Button>
          )
        })}
      </YStack>
    </Panel>
  )
}

function AccountScreen({ state }) {
  return (
    <>
      <Panel title="Profile and privacy">
        <YStack gap="$3">
          <XStack ai="center" jc="space-between" gap="$3">
            <YStack>
              <Text color="#09090b" fontSize={16} fontWeight="900">
                {state.activeUser.name}
              </Text>
              <Muted>
                {state.authSession ? 'Signed in' : 'Signed out'} · {state.activeUser.email ?? state.activeUser.phone ?? state.activeUser.id} · {state.selectedRole}
              </Muted>
            </YStack>
          </XStack>
          <YStack bg="#f4f4f5" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3" gap="$2">
            <XStack ai="center" jc="space-between" gap="$3">
              <YStack flex={1}>
                <Text color="#09090b" fontSize={14} fontWeight="900">
                  Session
                </Text>
                <Muted>{state.authSession ? `Expires ${new Date(state.authSession.expiresAt).toLocaleString()}` : 'OIDC sign-in is ready for Android and web.'}</Muted>
              </YStack>
              <SizableText color="#09090b" size="$2" fontWeight="900">
                {state.authSession?.user.provider ?? 'clerk'}
              </SizableText>
            </XStack>
            <XStack gap="$2" fw="wrap">
              {state.authSession ? (
                <>
                  <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label="Refresh" onPress={state.refreshSession} />
                  <SecondaryButton icon={<LogOut size={16} color="#09090b" />} label="Sign out" onPress={state.signOut} />
                </>
              ) : (
                <SecondaryButton icon={<LogIn size={16} color="#09090b" />} label="Sign in" onPress={state.signIn} />
              )}
            </XStack>
          </YStack>
        </YStack>
      </Panel>

      <Panel title="Linked identity">
        <YStack gap="$3">
          <FeatureList
            rows={[
              ['Invite matching', 'Group invites can be accepted only when your linked email or phone matches the invite.'],
              ['Status', state.identityStatus],
            ]}
          />
          <Field label="Display name">
            <Input value={state.profileName} onChangeText={state.setProfileName} placeholder="Your name" {...inputProps} />
          </Field>
          <Field label="Email">
            <Input value={state.profileEmail} onChangeText={state.setProfileEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" {...inputProps} />
          </Field>
          <Field label="Phone">
            <Input value={state.profilePhone} onChangeText={state.setProfilePhone} placeholder="+91 90000 00000" keyboardType="phone-pad" {...inputProps} />
          </Field>
          <Field label="Preferred payment">
            <XStack gap="$1.5" fw="wrap">
              {state.paymentMethods.map((method) => (
                <Chip key={method} label={method.toUpperCase()} active={state.profilePayment === method} onPress={() => state.setProfilePayment(method)} />
              ))}
            </XStack>
          </Field>
          <PrimaryButton icon={<ShieldCheck size={17} color="#ffffff" />} label="Save identity" onPress={state.saveAccountIdentity} />
        </YStack>
      </Panel>

      <Panel title="Profile switcher">
        <YStack gap="$3">
        <Field label="Switch profile">
          <XStack gap="$1.5" fw="wrap">
            {state.ledger.members.slice(0, 5).map((member) => (
              <Chip key={member.id} label={member.name} active={state.activeUserId === member.id} onPress={() => state.setActiveUserId(member.id)} />
            ))}
          </XStack>
        </Field>
        <Button unstyled onPress={() => state.setPrivateBalances(!state.privateBalances)}>
          <XStack ai="center" jc="space-between" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
            <YStack>
              <Text color="#09090b" fontSize={14} fontWeight="900">
                Private balances
              </Text>
              <Muted>{state.privateBalances ? 'Only show balances to involved members.' : 'Group members can see shared balances.'}</Muted>
            </YStack>
            <SizableText color="#09090b" size="$2" fontWeight="900">
              {state.privateBalances ? 'On' : 'Off'}
            </SizableText>
          </XStack>
        </Button>
        </YStack>
      </Panel>
    </>
  )
}

function NotificationsScreen({ state }) {
  return (
    <>
      <Panel title="Unread activity" actionLabel="Read all" onAction={state.markAllNotificationsRead}>
        <XStack ai="center" jc="space-between" gap="$3">
          <YStack flex={1}>
            <Text color="#09090b" fontSize={28} lineHeight={34} fontWeight="900">
              {state.unreadNotificationCount}
            </Text>
            <Muted>{state.accountNotifications.length} recent account changes</Muted>
          </YStack>
          <Bell size={20} color="#09090b" />
        </XStack>
      </Panel>

      <Panel title="Recent activity">
        <YStack gap="$2">
          {state.accountNotifications.map((notification) => (
            <Button key={notification.id} unstyled onPress={() => state.markNotificationRead(notification.id)}>
              <XStack ai="center" gap="$3" py="$2.5" borderBottomWidth={1} borderColor="#f4f4f5">
                <YStack ai="center" jc="center" h={34} w={34} br={999} bg={notification.read ? '#f4f4f5' : '#09090b'}>
                  <SizableText color={notification.read ? '#09090b' : '#ffffff'} size="$1" fontWeight="900">
                    {notification.splitwiseType}
                  </SizableText>
                </YStack>
                <YStack flex={1}>
                  <Text color="#09090b" fontSize={14} fontWeight="900">
                    {notification.title}
                  </Text>
                  <Muted>
                    {notification.body} · {notification.actorId ? state.memberName(notification.actorId) : 'System'} · {new Date(notification.createdAt).toLocaleDateString()}
                  </Muted>
                </YStack>
                <SizableText color={notification.read ? '#a1a1aa' : '#09090b'} size="$2" fontWeight="900">
                  {notification.read ? 'Read' : 'New'}
                </SizableText>
              </XStack>
            </Button>
          ))}
          {state.accountNotifications.length === 0 ? <Muted>No recent activity yet.</Muted> : null}
        </YStack>
      </Panel>
    </>
  )
}

function PrivacyScreen({ state }) {
  const summary = state.visibilitySummary
  const groupViewers = summary.selectedGroupViewerIds.map(state.memberName).join(', ') || 'No group viewers'
  const privateViewers = summary.privateViewerIds.map(state.memberName).join(', ') || state.memberName(state.activeUserId)
  return (
    <>
      <Panel title="Visibility rules">
        <FeatureList
          rows={[
            ['Group expenses', 'Everyone in the group can view amounts, splits, comments, edits, and attachments.'],
            ['Non-group expenses', 'Only the payer and selected participants can view private expense details.'],
            ['Balances', 'Group balances are shared inside the group. Private balances stay between involved people.'],
          ]}
        />
      </Panel>

      <Panel title="Current group">
        <YStack gap="$3">
          <XStack ai="center" jc="space-between" gap="$3">
            <YStack flex={1}>
              <Muted>{state.selectedGroup?.name ?? 'No group selected'}</Muted>
              <Text color="#09090b" fontSize={28} lineHeight={34} fontWeight="900">
                {summary.selectedGroupExpenseCount}
              </Text>
              <Muted>visible group expenses</Muted>
            </YStack>
            <ShieldCheck size={20} color="#09090b" />
          </XStack>
          <FeatureList rows={[
            ['Can view', groupViewers],
            ['Rule', 'Group members share the same group ledger.'],
          ]} />
        </YStack>
      </Panel>

      <Panel title="Private expenses">
        <YStack gap="$3">
          <XStack ai="center" jc="space-between" gap="$3">
            <YStack flex={1}>
              <Muted>Non-group expenses involving {state.memberName(state.activeUserId)}</Muted>
              <Text color="#09090b" fontSize={28} lineHeight={34} fontWeight="900">
                {summary.privateExpenseCount}
              </Text>
              <Muted>{summary.visibleExpenseCount} total expenses visible to this profile</Muted>
            </YStack>
          </XStack>
          <FeatureList rows={[
            ['Can view', privateViewers],
            ['Rule', 'Private expenses never appear in a group ledger.'],
          ]} />
        </YStack>
      </Panel>
    </>
  )
}

function CurrenciesScreen({ state }) {
  const conversionTotal = state.currencyExposure.reduce((sum, item) => sum + item.convertedAmount, 0)
  const expenseCount = state.currencyExposure.reduce((sum, item) => sum + item.expenseCount, 0)
  const rateDate = state.ledger.exchangeRatesUpdatedAt
    ? new Date(state.ledger.exchangeRatesUpdatedAt).toLocaleDateString()
    : 'Offline'
  return (
    <>
      <Panel title="Currency workspace">
        <YStack gap="$3">
          <XStack ai="center" jc="space-between" gap="$3">
            <YStack flex={1}>
              <Muted>{state.selectedGroup?.name ?? 'Non-group expenses'}</Muted>
              <Text color="#09090b" fontSize={28} lineHeight={34} fontWeight="900">
                {state.currency} {conversionTotal.toFixed(2)}
              </Text>
            </YStack>
            <YStack ai="flex-end">
              <SizableText color="#09090b" size="$2" fontWeight="900">
                {state.ledger.defaultCurrency}
              </SizableText>
              <Muted>default</Muted>
            </YStack>
          </XStack>
          <FeatureList
            rows={[
              ['Rate source', state.ledger.exchangeRateSource ?? 'Offline reference rates'],
              ['Updated', rateDate],
              ['Expenses', `${expenseCount} active in scope`],
            ]}
          />
        </YStack>
      </Panel>

      <Panel title="Report currency">
        <YStack gap="$3">
          <XStack gap="$1.5" fw="wrap">
            {state.currencies.map((code) => (
              <Chip key={code} label={code} active={state.currency === code} onPress={() => state.setCurrency(code)} />
            ))}
          </XStack>
        </YStack>
      </Panel>

      <Panel title="Conversion preview">
        <YStack gap="$3">
          {state.currencyExposure.map((item) => (
            <XStack key={item.currency} ai="center" jc="space-between" gap="$3" py="$2" borderBottomWidth={1} borderColor="#f4f4f5">
              <YStack flex={1}>
                <Text color="#09090b" fontSize={14} fontWeight="900">
                  {item.currency} {item.originalAmount.toFixed(2)}
                </Text>
                <Muted>{item.expenseCount} expenses</Muted>
              </YStack>
              <SizableText color="#09090b" size="$2" fontWeight="900">
                {state.currency} {item.convertedAmount.toFixed(2)}
              </SizableText>
            </XStack>
          ))}
          {state.currencyExposure.length === 0 ? <Muted>No active expenses in this scope.</Muted> : null}
          <SecondaryButton icon={<CircleDollarSign size={16} color="#09090b" />} label={`Convert to ${state.currency}`} onPress={state.applyCurrencyConversion} />
        </YStack>
      </Panel>
    </>
  )
}

function AnalyticsScreen({ state }) {
  return (
    <>
      <Panel title="Spending totals">
        {state.categoryTotals.map((item) => (
          <XStack key={item.category} ai="center" gap="$2">
            <SizableText color="#3f3f46" size="$2" fontWeight="900" w={82}>
              {item.category}
            </SizableText>
            <YStack bg="#e4e4e7" br={999} flex={1} h={10} overflow="hidden">
              <YStack bg="#09090b" br={999} h={10} width={`${Math.max((item.amount / Math.max(state.totalSpending, 1)) * 100, 8)}%`} />
            </YStack>
            <SizableText color="#09090b" size="$2" fontWeight="900" ta="right" w={62}>
              {item.amount.toFixed(0)}
            </SizableText>
          </XStack>
        ))}
      </Panel>

      <Panel title="Trend over time">
        <YStack gap="$3">
          <Field label="Report currency">
            <XStack gap="$1.5" fw="wrap">
              {currencies.map((code) => (
                <Chip key={code} label={code} active={state.currency === code} onPress={() => state.setCurrency(code)} />
              ))}
            </XStack>
          </Field>
          {state.trendTotals.map((item) => (
            <XStack key={item.month} ai="center" gap="$2">
              <SizableText color="#3f3f46" size="$2" fontWeight="900" w={82}>
                {item.month}
              </SizableText>
              <YStack bg="#e4e4e7" br={999} flex={1} h={10} overflow="hidden">
                <YStack
                  bg="#09090b"
                  br={999}
                  h={10}
                  width={`${Math.max((item.amount / Math.max(...state.trendTotals.map((trend) => trend.amount), 1)) * 100, 8)}%`}
                />
              </YStack>
              <SizableText color="#09090b" size="$2" fontWeight="900" ta="right" w={72}>
                {state.currency} {item.amount.toFixed(0)}
              </SizableText>
            </XStack>
          ))}
        </YStack>
      </Panel>
    </>
  )
}

function ToolsScreen({ state }) {
  return (
    <>
      <Panel title="Tools">
        <FeatureList
          rows={[
            ['Receipt storage', 'R2-backed attachments and OCR pipeline.'],
            ['Currency conversion', 'Group and friend balances in selected currency.'],
            ['CSV export', 'Download spreadsheet-ready expense and settlement history.'],
            ['Full backup', 'Download a complete JSON ledger backup for account portability.'],
            ['Offline sync', 'Local-first ledger with D1 pull sync.'],
          ]}
        />
        <XStack gap="$2" mt="$2">
          <SecondaryButton icon={<Download size={16} color="#09090b" />} label="Export CSV" onPress={state.shareExport} />
          <SecondaryButton icon={<Download size={16} color="#09090b" />} label="Full backup" onPress={state.shareBackup} />
          <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label="Reset demo" onPress={state.restoreDemo} />
        </XStack>
      </Panel>
      <Panel title="Cloud sync">
        <YStack gap="$3">
          <FeatureList
            rows={[
              ['Worker API', state.cloudApiUrl || 'Not configured'],
              ['Session', state.authSession ? `${state.authSession.user.provider} · ${state.authSession.user.id}` : 'Signed out'],
              ['Last pull', state.lastCloudSync ? new Date(state.lastCloudSync.at).toLocaleString() : 'Never'],
              ['Last push', state.lastCloudPush ? `${state.lastCloudPush.label} · ${state.lastCloudPush.status}` : 'Never'],
            ]}
          />
          {state.lastCloudPush?.message ? <Muted>{state.lastCloudPush.message}</Muted> : null}
          {state.lastCloudSync ? (
            <FeatureList
              rows={[
                ['Remote adds', `${state.lastCloudSync.membersAdded} members · ${state.lastCloudSync.groupsAdded} groups · ${state.lastCloudSync.expensesAdded} expenses`],
                ['Local kept', `${state.lastCloudSync.localMembersPreserved} members · ${state.lastCloudSync.localGroupsPreserved} groups · ${state.lastCloudSync.localExpensesPreserved} expenses`],
                ['Conflicts', `${state.lastCloudSync.memberConflicts} members · ${state.lastCloudSync.groupConflicts} groups · ${state.lastCloudSync.expenseConflicts} expenses`],
              ]}
            />
          ) : null}
          <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label={state.cloudSyncReady ? 'Pull cloud ledger' : 'Check cloud sync'} onPress={state.pullCloudSync} />
        </YStack>
      </Panel>
      {state.lastCloudSync?.conflicts?.length ? (
        <Panel title="Sync conflicts">
          <YStack gap="$2">
            {state.lastCloudSync.conflicts.slice(0, 8).map((conflict) => (
              <YStack key={conflict.id} bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3" gap="$2">
                <XStack ai="center" jc="space-between" gap="$3">
                  <YStack flex={1}>
                    <Text color="#09090b" fontSize={14} fontWeight="900">
                      {conflict.label}
                    </Text>
                    <Muted>
                      {conflict.entity} · local {conflict.localTimestamp ?? 'no timestamp'} · cloud {conflict.remoteTimestamp ?? 'no timestamp'}
                    </Muted>
                  </YStack>
                  <RefreshCcw size={16} color="#09090b" />
                </XStack>
                <XStack gap="$2" fw="wrap">
                  <SecondaryButton icon={<Check size={16} color="#09090b" />} label="Keep cloud" onPress={() => state.resolveCloudConflict(conflict.id, 'cloud')} />
                  <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label="Keep local" onPress={() => state.resolveCloudConflict(conflict.id, 'local')} />
                </XStack>
              </YStack>
            ))}
            {state.lastCloudSync.conflicts.length > 8 ? <Muted>{state.lastCloudSync.conflicts.length - 8} more conflicts remain.</Muted> : null}
          </YStack>
        </Panel>
      ) : null}
      <Panel title="Deleted groups">
        <YStack gap="$2">
          {state.deletedGroups.map((group) => (
            <XStack key={group.id} ai="center" jc="space-between" gap="$3" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
              <YStack flex={1}>
                <Text color="#09090b" fontSize={14} fontWeight="900">
                  {group.name}
                </Text>
                <Muted>{group.memberIds.length} members · deleted {new Date(group.deletedAt).toLocaleDateString()}</Muted>
              </YStack>
              <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label="Restore" onPress={() => state.restoreGroup(group.id)} />
            </XStack>
          ))}
          {state.deletedGroups.length === 0 ? <Muted>No deleted groups.</Muted> : null}
        </YStack>
      </Panel>
    </>
  )
}

function RecurringBillsScreen({ state }) {
  return (
    <>
      <Panel title="Recurring bills">
        <YStack gap="$2">
          <YStack bg="#f4f4f5" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3" gap="$2">
            <XStack ai="center" jc="space-between" gap="$3">
              <YStack flex={1}>
                <Text color="#09090b" fontSize={14} fontWeight="900">
                  Reminder notifications
                </Text>
                <Muted>
                  {state.notificationStatus} · {state.scheduledReminders.length} scheduled
                </Muted>
              </YStack>
              <Bell size={18} color="#09090b" />
            </XStack>
            <XStack gap="$2" fw="wrap">
              <SecondaryButton icon={<Bell size={16} color="#09090b" />} label="Enable" onPress={state.requestReminderPermission} />
              <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label="Schedule" onPress={state.scheduleRecurringReminders} />
            </XStack>
          </YStack>
          {state.upcomingRecurring.map((expense) => (
            <XStack key={expense.sourceExpenseId} ai="center" gap="$2" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
              <YStack flex={1}>
                <Text color="#09090b" fontSize={14} fontWeight="900">
                  {expense.description}
                </Text>
                <Muted>
                  {expense.recurrence} · due {expense.dueDate}
                  {expense.reminderDate ? ` · remind ${expense.reminderDate}` : ''}
                </Muted>
              </YStack>
              <SizableText color="#09090b" size="$3" fontWeight="900">
                {expense.currency} {expense.amount.toFixed(0)}
              </SizableText>
              <Button unstyled onPress={() => state.postRecurringOccurrence(expense.sourceExpenseId)}>
                <SizableText color="#09090b" size="$2" fontWeight="900">
                  Post
                </SizableText>
              </Button>
              <Button unstyled onPress={() => state.cancelRecurring(expense.sourceExpenseId)}>
                <SizableText color="#71717a" size="$2" fontWeight="900">
                  Cancel
                </SizableText>
              </Button>
            </XStack>
          ))}
          {state.upcomingRecurring.length === 0 ? <Muted>No active recurring bills.</Muted> : null}
        </YStack>
      </Panel>
    </>
  )
}

function DesktopNav({ activeTab, onChange, syncState, unreadNotificationCount }) {
  return (
    <YStack width={276} bg="#ffffff" borderRightWidth={1} borderColor="#e5e5e5" px="$3" py="$4" gap="$4">
      <YStack gap="$1" px="$2">
        <SizableText color="#71717a" size="$2" fontWeight="800" textTransform="uppercase">
          SplitClub
        </SizableText>
        <Text color="#09090b" fontSize={24} lineHeight={29} fontWeight="900">
          Ledger
        </Text>
      </YStack>

      <YStack gap="$1">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = activeTab === item.id
          const badge = item.id === 'settings' && unreadNotificationCount > 0 ? unreadNotificationCount : null
          return (
            <Button
              key={item.id}
              unstyled
              onPress={() => onChange(item.id)}
              bg={active ? '#09090b' : '#ffffff'}
              borderWidth={1}
              borderColor={active ? '#09090b' : '#ffffff'}
              br="$2"
              px="$3"
              py="$2.5"
              pressStyle={{ bg: active ? '#18181b' : '#f4f4f5', scale: 0.99 }}
            >
              <XStack ai="center" gap="$2.5">
                <YStack ai="center" jc="center" h={34} w={34} br="$2" bg={active ? '#27272a' : '#f4f4f5'}>
                  <Icon size={17} color={active ? '#ffffff' : '#09090b'} />
                </YStack>
                <YStack flex={1}>
                  <Text color={active ? '#ffffff' : '#09090b'} fontSize={14} fontWeight="900">
                    {item.label}
                  </Text>
                  <SizableText color={active ? '#d4d4d8' : '#71717a'} size="$2" numberOfLines={1}>
                    {item.description}
                  </SizableText>
                </YStack>
                {badge ? (
                  <YStack ai="center" jc="center" minWidth={24} h={24} br={999} bg={active ? '#ffffff' : '#09090b'} px="$2">
                    <SizableText color={active ? '#09090b' : '#ffffff'} size="$1" fontWeight="900">
                      {badge}
                    </SizableText>
                  </YStack>
                ) : null}
              </XStack>
            </Button>
          )
        })}
      </YStack>

      <YStack mt="auto" gap="$2" borderTopWidth={1} borderColor="#e5e5e5" pt="$3" px="$2">
        <SizableText color="#71717a" size="$2" fontWeight="800" textTransform="uppercase">
          Sync
        </SizableText>
        <Muted>{syncState}</Muted>
      </YStack>
    </YStack>
  )
}

function BottomNav({ activeTab, onChange }) {
  return (
    <YStack position="absolute" left={0} right={0} bottom={0} bg="#ffffff" borderTopWidth={1} borderColor="#e5e5e5" px="$3" pt="$2" pb="$3">
      <XStack maxWidth={820} width="100%" alignSelf="center" jc="space-between" gap="$1">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = activeTab === item.id
          return (
            <Button
              key={item.id}
              unstyled
              flex={1}
              ai="center"
              gap="$1"
              py="$2"
              br="$2"
              bg={active ? '#09090b' : '#ffffff'}
              onPress={() => onChange(item.id)}
              pressStyle={{ scale: 0.98, bg: active ? '#18181b' : '#f4f4f5' }}
            >
              <Icon size={18} color={active ? '#ffffff' : '#52525b'} />
              <SizableText color={active ? '#ffffff' : '#52525b'} size="$1" fontWeight="900">
                {item.label}
              </SizableText>
            </Button>
          )
        })}
      </XStack>
    </YStack>
  )
}

function Panel({ title, actionLabel, onAction, children }) {
  return (
    <YStack bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" gap="$3" p="$3.5">
      {title ? (
        <XStack ai="center" jc="space-between" gap="$3">
          <Text color="#09090b" fontSize={17} fontWeight="900">
            {title}
          </Text>
          {actionLabel ? (
            <Button unstyled onPress={onAction}>
              <SizableText color="#09090b" size="$2" fontWeight="900">
                {actionLabel}
              </SizableText>
            </Button>
          ) : null}
        </XStack>
      ) : null}
      {children}
    </YStack>
  )
}

function ExpenseRow({ expense, onPress }) {
  return (
    <Button unstyled onPress={onPress}>
      <XStack ai="center" gap="$2.5" py="$2.5" borderBottomWidth={1} borderColor="#f4f4f5">
        <YStack ai="center" jc="center" bg="#f4f4f5" br={999} h={36} w={36}>
          <ReceiptText size={17} color="#09090b" />
        </YStack>
        <YStack flex={1}>
          <Text color="#09090b" fontSize={15} fontWeight="900">
            {expense.description}
          </Text>
          <Muted>
            {expense.category} · {expense.payments?.length ? 'multi-payer' : expense.splitMode} · {expense.date}
          </Muted>
        </YStack>
        <Text color="#09090b" fontSize={14} fontWeight="900">
          {expense.currency} {expense.amount.toFixed(0)}
        </Text>
      </XStack>
    </Button>
  )
}

function GroupButton({ label, meta, active, onPress }) {
  return (
    <Button unstyled onPress={onPress}>
      <XStack ai="center" jc="space-between" bg={active ? '#09090b' : '#ffffff'} borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
        <YStack>
          <Text color={active ? '#ffffff' : '#09090b'} fontSize={15} fontWeight="900">
            {label}
          </Text>
          {meta ? <SizableText color={active ? '#d4d4d8' : '#71717a'} size="$2">{meta}</SizableText> : null}
        </YStack>
        <Home size={17} color={active ? '#ffffff' : '#52525b'} />
      </XStack>
    </Button>
  )
}

function FeatureList({ rows }) {
  return (
    <YStack gap="$2">
      {rows.map(([title, body]) => (
        <XStack key={title} gap="$2.5" ai="flex-start" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
          {title.includes('Receipt') ? <Camera size={17} color="#09090b" /> : null}
          {title.includes('Recurring') ? <Bell size={17} color="#09090b" /> : null}
          {title.includes('Currency') || title.includes('Split') ? <CircleDollarSign size={17} color="#09090b" /> : null}
          {title.includes('CSV') || title.includes('Offline') ? <TrendingUp size={17} color="#09090b" /> : null}
          <YStack flex={1}>
            <Text color="#09090b" fontSize={14} fontWeight="900">
              {title}
            </Text>
            <Muted>{body}</Muted>
          </YStack>
        </XStack>
      ))}
    </YStack>
  )
}

function Field({ label, children }) {
  return (
    <YStack gap="$2">
      <Label>{label}</Label>
      {children}
    </YStack>
  )
}

function Chip({ label, active, onPress }) {
  return (
    <Button unstyled onPress={onPress} bg={active ? '#09090b' : '#f4f4f5'} borderWidth={1} borderColor={active ? '#09090b' : '#e4e4e7'} br={999} px="$3" py="$2">
      <SizableText color={active ? '#ffffff' : '#3f3f46'} size="$2" fontWeight="900">
        {label}
      </SizableText>
    </Button>
  )
}

function PrimaryButton({ icon, label, onPress }) {
  return (
    <Button h={48} br="$2" bg="#09090b" color="#ffffff" onPress={onPress} pressStyle={{ bg: '#27272a', scale: 0.99 }}>
      <XStack ai="center" gap="$2">
        {icon}
        <Text color="#ffffff" fontSize={15} fontWeight="900">
          {label}
        </Text>
      </XStack>
    </Button>
  )
}

function SecondaryButton({ icon, label, onPress }) {
  return (
    <Button flex={1} h={44} br="$2" bg="#ffffff" borderColor="#e4e4e7" borderWidth={1} color="#09090b" onPress={onPress} pressStyle={{ bg: '#f4f4f5', scale: 0.99 }}>
      <XStack ai="center" jc="center" gap="$2">
        {icon}
        <SizableText color="#09090b" size="$3" fontWeight="900">
          {label}
        </SizableText>
      </XStack>
    </Button>
  )
}

function Label({ children }) {
  return (
    <SizableText color="#52525b" size="$2" fontWeight="900" textTransform="uppercase">
      {children}
    </SizableText>
  )
}

function Muted({ children }) {
  return (
    <SizableText color="#71717a" size="$2" lineHeight={17}>
      {children}
    </SizableText>
  )
}

const inputProps = {
  bg: '#ffffff',
  borderColor: '#d4d4d8',
  color: '#09090b',
  fontSize: 16,
  h: 46,
  br: '$3',
}
