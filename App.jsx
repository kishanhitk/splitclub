import { StatusBar } from 'expo-status-bar'
import * as AuthSession from 'expo-auth-session'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import * as Notifications from 'expo-notifications'
import * as Sharing from 'expo-sharing'
import * as WebBrowser from 'expo-web-browser'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Linking, Platform, SafeAreaView, Share, useWindowDimensions } from 'react-native'
import { ScrollView, TamaguiProvider, XStack, YStack } from 'tamagui'
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
import { currencies, paymentMethods, paymentStatuses } from './src/ui/app-config'
import {
  AddExpenseScreen,
  ActivityScreen,
  BalancesScreen,
  BottomNav,
  DesktopNav,
  ExpenseDetailScreen,
  GroupSettingsScreen,
  GroupsScreen,
  Header,
  HomeScreen,
  MoreScreen,
  buildRouteMeta,
  buildSplitPreview,
  downloadTextFile,
  ensureSplitValues,
  expenseRevision,
  groupRevision,
  memberRevision,
  payerValuesWithFallback,
  replaceRecord,
  splitsToValues,
  syncSummaryWithConflicts,
  valuesToSplits,
} from './src/ui/app-shell'
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
  const [activeTab, setActiveTab] = useState('home')
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
  const [selectedReceiptId, setSelectedReceiptId] = useState(null)
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
  const [selectedFriendId, setSelectedFriendId] = useState(null)
  const [editFriendName, setEditFriendName] = useState('')
  const [editFriendContact, setEditFriendContact] = useState('')
  const [editFriendPayment, setEditFriendPayment] = useState('upi')
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
  const [pushRegistrationStatus, setPushRegistrationStatus] = useState('Push not registered')
  const [scheduledReminders, setScheduledReminders] = useState([])
  const [cloudRecurringSchedules, setCloudRecurringSchedules] = useState([])
  const [recurringCloudStatus, setRecurringCloudStatus] = useState('Cloud schedules not loaded')
  const [settlementMethod, setSettlementMethod] = useState('cash')
  const [settlementReference, setSettlementReference] = useState('')
  const [settlementStatus, setSettlementStatus] = useState('recorded')
  const [readNotificationIds, setReadNotificationIds] = useState([])
  const [authSession, setAuthSession] = useState(null)
  const [authProviderStatus, setAuthProviderStatus] = useState({
    provider: getAuthProviderConfig().provider,
    configured: false,
    clientConfigured: hasRemoteAuthConfig(),
    issuerHost: null,
    checkedAt: null,
    loading: false,
    message: 'Provider not checked',
  })
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
  const loadAuthProviderStatus = async () => {
    const config = getAuthProviderConfig()
    const clientConfigured = hasRemoteAuthConfig(config)
    if (!cloudApiUrl) {
      setAuthProviderStatus({
        provider: config.provider,
        configured: false,
        clientConfigured,
        issuerHost: null,
        checkedAt: new Date().toISOString(),
        loading: false,
        message: 'Set EXPO_PUBLIC_SPLITCLUB_API_URL to check Worker auth.',
      })
      return
    }

    setAuthProviderStatus((current) => ({
      ...current,
      provider: config.provider,
      clientConfigured,
      loading: true,
      message: 'Checking provider',
    }))

    try {
      const response = await fetch(`${cloudApiUrl}/api/auth/config`)
      if (!response.ok) throw new Error(`Worker returned ${response.status}`)
      const status = await response.json()
      const ready = Boolean(status.configured && clientConfigured)
      setAuthProviderStatus({
        provider: status.provider ?? config.provider,
        configured: Boolean(status.configured),
        clientConfigured,
        issuerHost: status.issuerHost ?? null,
        jwksConfigured: Boolean(status.jwksConfigured),
        audienceConfigured: Boolean(status.audienceConfigured),
        requiredClaims: status.requiredClaims ?? [],
        supportedAlgorithms: status.supportedAlgorithms ?? [],
        checkedAt: new Date().toISOString(),
        loading: false,
        message: ready ? 'Provider ready for Android and web sign-in' : status.configured ? 'Worker ready; app client env is missing' : 'Worker auth is missing JWT issuer, audience, or keys',
      })
    } catch (error) {
      setAuthProviderStatus({
        provider: config.provider,
        configured: false,
        clientConfigured,
        issuerHost: null,
        checkedAt: new Date().toISOString(),
        loading: false,
        message: error instanceof Error ? error.message : 'Provider check failed',
      })
    }
  }
  const selectedGroupDefaultsKey = selectedGroup
    ? `${selectedGroup.id}:${selectedGroup.defaultCurrency}:${selectedGroup.defaultSplitMode}:${selectedGroup.defaultSplits.map((split) => `${split.memberId}-${split.value}`).join('|')}`
    : 'non-group'

  useEffect(() => {
    loadAuthProviderStatus().catch(() => undefined)
  }, [cloudApiUrl])

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
    const baseRevision = groupRevision(selectedGroup)
    const updatedAt = new Date().toISOString()
    setLedger((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === selectedGroup.id
          ? { ...group, simplifyDebts: groupSimplifyDebts, defaultSplitMode: groupDefaultMode, defaultSplits, updatedAt }
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
    }, 'Group defaults', 'PUT', { baseRevision }).catch(() => undefined)
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
      updatedAt: new Date().toISOString(),
    }
    const baseRevision = memberRevision(activeUser)
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
    }, 'Account identity', 'PUT', { baseRevision }).catch(() => undefined)
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
      receiptId: selectedReceiptId || undefined,
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
    const baseRevision = groupRevision(selectedGroup)
    setLedger((current) => ({
      ...current,
      groups: current.groups.map((group) => group.id === selectedGroup.id ? { ...group, deletedAt, updatedAt: deletedAt } : group),
    }))
    setSelectedGroupId(null)
    setSyncState('Group deleted')
    pushCloudJson(`/api/groups/${selectedGroup.id}`, undefined, 'Group delete', 'DELETE', { baseRevision }).catch(() => undefined)
  }

  const restoreGroup = (groupId) => {
    const groupToRestore = ledger.groups.find((group) => group.id === groupId)
    const baseRevision = groupRevision(groupToRestore)
    const updatedAt = new Date().toISOString()
    setLedger((current) => ({
      ...current,
      groups: current.groups.map((group) => group.id === groupId ? { ...group, deletedAt: undefined, updatedAt } : group),
    }))
    setSelectedGroupId(groupId)
    setSyncState('Group restored')
    pushCloudJson(`/api/groups/${groupId}/restore`, {}, 'Group restore', 'POST', { baseRevision }).catch(() => undefined)
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
      setSelectedReceiptId(body.receipt.id)
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
    setSelectedReceiptId(receipt.id)
    setReceiptItems(receipt.extractedItems ?? [])
    if (receipt.ocrText) setReceiptOcrText(receipt.ocrText)
    setSyncState('Receipt items applied')
  }

  const retryCloudReceipt = async (receiptId) => {
    if (!cloudSyncReady) {
      setReceiptLibraryStatus('Sign in and configure cloud sync to retry OCR')
      return
    }
    try {
      const response = await fetch(`${cloudApiUrl}/api/receipts/${receiptId}/retry`, {
        method: 'POST',
        headers: {
          ...sessionHeaders(authSession),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ocrText: receiptOcrText,
          assignedTo: membersForGroup.map((member) => member.id),
        }),
      })
      if (!response.ok) {
        throw new Error(`Worker returned ${response.status}`)
      }
      const body = await response.json()
      if (body.receipt) {
        setCloudReceipts((receipts) => [body.receipt, ...receipts.filter((receipt) => receipt.id !== body.receipt.id)])
        setAttachmentName(body.receipt.fileName ?? 'receipt')
        setSelectedReceiptId(body.receipt.id)
      }
      setReceiptItems(body.extractedItems ?? body.receipt?.extractedItems ?? [])
      setReceiptLibraryStatus(`OCR retried: ${(body.extractedItems ?? []).length} items`)
      setSyncState('Receipt OCR retried')
    } catch (error) {
      setReceiptLibraryStatus(error instanceof Error ? error.message : 'Receipt retry failed')
    }
  }

  const markReceiptReviewed = async () => {
    if (!selectedReceiptId) {
      setReceiptLibraryStatus('Select or upload a receipt before marking review complete')
      return
    }
    const localReceipt = cloudReceipts.find((receipt) => receipt.id === selectedReceiptId)
    const localReview = {
      id: `receipt_review_${Date.now()}`,
      receiptId: selectedReceiptId,
      actorId: activeUser.id,
      action: 'reviewed',
      source: 'manual_review',
      ocrStatus: localReceipt?.ocrStatus ?? 'complete',
      itemCount: receiptItems.length,
      createdAt: new Date().toISOString(),
    }

    if (!cloudSyncReady) {
      setCloudReceipts((receipts) => receipts.map((receipt) => (
        receipt.id === selectedReceiptId
          ? { ...receipt, reviewHistory: [localReview, ...(receipt.reviewHistory ?? [])] }
          : receipt
      )))
      setReceiptLibraryStatus('Receipt review marked locally')
      setSyncState('Receipt review ready')
      return
    }

    try {
      const response = await fetch(`${cloudApiUrl}/api/receipts/${selectedReceiptId}/review`, {
        method: 'POST',
        headers: sessionHeaders(authSession),
      })
      if (!response.ok) throw new Error(`Receipt review returned ${response.status}`)
      const body = await response.json()
      if (body.receipt) {
        setCloudReceipts((receipts) => [body.receipt, ...receipts.filter((receipt) => receipt.id !== body.receipt.id)])
      }
      setReceiptLibraryStatus('Receipt review complete')
      setSyncState('Receipt reviewed')
    } catch (error) {
      setReceiptLibraryStatus(error instanceof Error ? error.message : 'Receipt review failed')
    }
  }

  const openReceiptFile = async ({ receiptId, fileName = 'receipt', contentType }) => {
    if (!cloudSyncReady) {
      setReceiptLibraryStatus('Sign in and configure cloud sync to open receipts')
      return
    }
    const url = `${cloudApiUrl}/api/receipts/${receiptId}/file`
    try {
      if (Platform.OS === 'web') {
        const response = await fetch(url, { headers: sessionHeaders(authSession) })
        if (!response.ok) throw new Error(`Worker returned ${response.status}`)
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        window.open(objectUrl, '_blank', 'noopener,noreferrer')
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
      } else {
        const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-')
        const localUri = `${FileSystem.cacheDirectory}${safeFileName}`
        const download = await FileSystem.downloadAsync(url, localUri, {
          headers: sessionHeaders(authSession),
        })
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(download.uri, {
            mimeType: contentType,
            dialogTitle: fileName,
          })
        } else {
          await Linking.openURL(download.uri)
        }
      }
      setReceiptLibraryStatus(`Opened ${fileName}`)
      setSyncState(`Opened ${fileName}`)
    } catch (error) {
      setReceiptLibraryStatus(error instanceof Error ? error.message : 'Receipt open failed')
    }
  }

  const openCloudReceipt = async (receiptId) => {
    const receipt = cloudReceipts.find((candidate) => candidate.id === receiptId)
    if (!receipt) return
    await openReceiptFile({
      receiptId,
      fileName: receipt.fileName ?? 'receipt',
      contentType: receipt.contentType,
    })
  }

  const openSelectedExpenseReceipt = async () => {
    if (!selectedExpense) return
    if (!selectedExpense.receiptId) {
      const label = selectedExpense.attachmentName ?? 'This expense'
      setSyncState(`${label} is saved as local attachment metadata`)
      Alert.alert('Local attachment', 'This expense has an attachment name but no cloud receipt file yet.')
      return
    }
    const receipt = cloudReceipts.find((candidate) => candidate.id === selectedExpense.receiptId)
    await openReceiptFile({
      receiptId: selectedExpense.receiptId,
      fileName: receipt?.fileName ?? selectedExpense.attachmentName ?? 'receipt',
      contentType: receipt?.contentType,
    })
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

  const openFriendProfile = (friend) => {
    setSelectedFriendId(friend.id)
    setEditFriendName(friend.name ?? '')
    setEditFriendContact(friend.email ?? friend.phone ?? '')
    setEditFriendPayment(friend.preferredPayment ?? 'cash')
  }

  const saveFriendProfile = () => {
    const friend = ledger.members.find((member) => member.id === selectedFriendId)
    if (!friend) return
    const name = editFriendName.trim()
    const contact = editFriendContact.trim()
    if (!name) {
      Alert.alert('Friend name required', 'Add a name before saving this friend.')
      return
    }
    const isEmail = contact.includes('@')
    const updatedAt = new Date().toISOString()
    const updated = {
      ...friend,
      name,
      email: isEmail ? contact.toLowerCase() : undefined,
      phone: !isEmail && contact ? contact : undefined,
      avatar: friend.avatar ?? name.slice(0, 2).toUpperCase(),
      preferredPayment: editFriendPayment,
      updatedAt,
    }
    const baseRevision = memberRevision(friend)
    setLedger((current) => ({
      ...current,
      members: current.members.map((member) => (member.id === friend.id ? updated : member)),
    }))
    setSyncState('Friend updated')
    pushCloudJson(`/api/friends/${friend.id}`, {
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      avatar: updated.avatar,
      preferredPayment: updated.preferredPayment,
    }, 'Friend profile', 'PUT', { baseRevision }).catch(() => undefined)
  }

  const removeFriendProfile = () => {
    const friend = ledger.members.find((member) => member.id === selectedFriendId)
    if (!friend || friend.id === activeUser.id) return
    const balance = friendBalanceSummaries.find((summary) => summary.friendId === friend.id)
    if (balance && Math.abs(balance.amount) >= 0.01) {
      setSyncState(`Settle ${friend.name} before removing`)
      Alert.alert('Open balance', 'Settle this friend before removing them.')
      return
    }
    const baseRevision = memberRevision(friend)
    setLedger((current) => ({
      ...current,
      members: current.members.filter((member) => member.id !== friend.id),
    }))
    setSelectedFriendId(null)
    setSyncState('Friend removed')
    pushCloudJson(`/api/friends/${friend.id}`, undefined, 'Friend removal', 'DELETE', { baseRevision }).catch(() => undefined)
  }

  const createInvite = () => {
    if (!selectedGroupId || !inviteEmail.trim()) {
      Alert.alert('Invite needs a group and email', 'Choose a group and add an email.')
      return
    }
    const group = ledger.groups.find((candidate) => candidate.id === selectedGroupId)
    const baseRevision = groupRevision(group)
    const updatedAt = new Date().toISOString()
    const invite = {
      id: `invite-${Date.now()}`,
      groupId: selectedGroupId,
      invitedEmail: inviteEmail.trim(),
      role: inviteRole,
      status: 'pending',
      token: `join_${Date.now()}`,
    }
    setPendingInvites((invites) => [invite, ...invites])
    setLedger((current) => ({
      ...current,
      groups: current.groups.map((candidate) => (candidate.id === selectedGroupId ? { ...candidate, updatedAt } : candidate)),
    }))
    setSyncState('Invite created')
    pushCloudJson(`/api/groups/${selectedGroupId}/invites`, {
      invitedEmail: invite.invitedEmail,
      role: invite.role,
    }, 'Group invite', 'POST', { baseRevision }).catch(() => undefined)
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
          ? { ...group, memberIds: [...group.memberIds, invitee.id], updatedAt: new Date().toISOString() }
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
    const group = ledger.groups.find((candidate) => candidate.id === invite.groupId)
    const baseRevision = groupRevision(group)
    applyAcceptedInvite(invite)
    pushCloudJson(`/api/invites/${invite.token}/accept`, { groupId: invite.groupId }, 'Invite acceptance', 'POST', { baseRevision }).catch(() => undefined)
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
    const localInviteGroup = localInvite ? ledger.groups.find((candidate) => candidate.id === localInvite.groupId) : null
    const localInviteBaseRevision = groupRevision(localInviteGroup)

    if (cloudSyncReady) {
      try {
        const response = await fetch(`${cloudApiUrl}/api/invites/${encodeURIComponent(token)}/accept`, {
          method: 'POST',
          headers: {
            ...sessionHeaders(authSession),
            ...(localInviteBaseRevision ? { 'x-splitclub-base-revision': localInviteBaseRevision } : {}),
            'content-type': 'application/json',
          },
          body: JSON.stringify(localInvite?.groupId ? { groupId: localInvite.groupId } : {}),
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
      pushCloudJson(`/api/invites/${token}/accept`, { groupId: localInvite.groupId }, 'Invite acceptance', 'POST', { baseRevision: localInviteBaseRevision }).catch(() => undefined)
      return
    }

    setSyncState('Invite needs cloud sign-in')
    setInviteLinkStatus('Invite not found locally. Sign in with cloud sync to accept it.')
    Alert.alert('Invite not found locally', 'Sign in and configure the Worker API to accept invite links that are not already on this device.')
  }

  const setMemberRole = (memberId, role) => {
    if (!selectedGroupId) return
    const group = ledger.groups.find((candidate) => candidate.id === selectedGroupId)
    const baseRevision = groupRevision(group)
    const updatedAt = new Date().toISOString()
    setMembershipRoles((current) => ({
      ...current,
      [selectedGroupId]: {
        ...(current[selectedGroupId] ?? {}),
        [memberId]: role,
      },
    }))
    setLedger((current) => ({
      ...current,
      groups: current.groups.map((candidate) => (candidate.id === selectedGroupId ? { ...candidate, updatedAt } : candidate)),
    }))
    setSyncState('Permissions updated')
    pushCloudJson(`/api/groups/${selectedGroupId}/members/${memberId}`, {
      role,
    }, 'Member role', 'PUT', { baseRevision }).catch(() => undefined)
  }

  const removeMember = (memberId) => {
    if (!selectedGroupId) return
    const group = ledger.groups.find((candidate) => candidate.id === selectedGroupId)
    const baseRevision = groupRevision(group)
    const updatedAt = new Date().toISOString()
    const balance = calculateBalances(ledger, selectedGroupId, currency).find((item) => item.memberId === memberId)
    if (balance && Math.abs(balance.amount) >= 0.01) {
      setSyncState(`Settle ${memberName(memberId)} before removing`)
      return
    }
    setLedger((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        group.id === selectedGroupId ? { ...group, memberIds: group.memberIds.filter((id) => id !== memberId), updatedAt } : group,
      ),
    }))
    setSyncState('Member removed')
    pushCloudJson(`/api/groups/${selectedGroupId}/members/${memberId}`, undefined, 'Member removal', 'DELETE', { baseRevision }).catch(() => undefined)
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

  const registerPushNotifications = async () => {
    if (!cloudSyncReady) {
      setPushRegistrationStatus('Sign in and configure cloud sync first')
      return
    }
    const allowed = await requestReminderPermission()
    if (!allowed) {
      setPushRegistrationStatus('Notification permission denied')
      return
    }

    try {
      const tokenResponse = await Notifications.getExpoPushTokenAsync()
      const response = await fetch(`${cloudApiUrl}/api/notifications/push-subscriptions`, {
        method: 'POST',
        headers: {
          ...sessionHeaders(authSession),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          token: tokenResponse.data,
          platform: Platform.OS,
          deviceName: Platform.OS === 'web' ? 'web' : 'android',
        }),
      })
      if (!response.ok) throw new Error(`Push registration returned ${response.status}`)
      setPushRegistrationStatus('Push registered for recurring bills')
      setSyncState('Push notifications registered')
    } catch (error) {
      setPushRegistrationStatus(error instanceof Error ? error.message : 'Push registration failed')
    }
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

  const loadCloudRecurringSchedules = async () => {
    if (!cloudSyncReady) {
      setRecurringCloudStatus('Sign in and configure cloud sync to load schedules')
      return
    }
    try {
      const response = await fetch(`${cloudApiUrl}/api/recurring`, {
        headers: sessionHeaders(authSession),
      })
      if (!response.ok) throw new Error(`Worker returned ${response.status}`)
      const body = await response.json()
      setCloudRecurringSchedules(body.schedules ?? [])
      setRecurringCloudStatus(`${body.schedules?.length ?? 0} cloud schedules loaded`)
    } catch (error) {
      setRecurringCloudStatus(error instanceof Error ? error.message : 'Recurring schedules failed to load')
    }
  }

  const runCloudRecurringAction = async (sourceExpenseId, action) => {
    if (!cloudSyncReady) {
      setRecurringCloudStatus('Sign in and configure cloud sync to update schedules')
      return
    }
    try {
      const response = await fetch(`${cloudApiUrl}/api/recurring/${sourceExpenseId}/${action}`, {
        method: 'POST',
        headers: sessionHeaders(authSession),
      })
      if (!response.ok) throw new Error(`Worker returned ${response.status}`)
      await loadCloudRecurringSchedules()
      setRecurringCloudStatus(action === 'post' ? 'Cloud occurrence posted' : 'Cloud occurrence skipped')
      setSyncState(action === 'post' ? 'Recurring bill posted in cloud' : 'Recurring bill skipped in cloud')
    } catch (error) {
      setRecurringCloudStatus(error instanceof Error ? error.message : 'Recurring action failed')
    }
  }

  const addSettlement = (from, to, settlementAmount) => {
    const group = selectedGroupId ? ledger.groups.find((candidate) => candidate.id === selectedGroupId) : null
    const baseRevision = groupRevision(group)
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
    }, 'Settlement', 'POST', { baseRevision }).catch(() => undefined)
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
    authProviderStatus,
    loadAuthProviderStatus,
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
    selectedReceiptId,
    cloudReceipts,
    receiptLibraryStatus,
    itemizedTotal,
    itemizedSplits,
    addReceiptItem,
    toggleReceiptItemAssignment,
    applyItemizedSplit,
    loadCloudReceipts,
    applyCloudReceipt,
    retryCloudReceipt,
    markReceiptReviewed,
    openCloudReceipt,
    openSelectedExpenseReceipt,
    removeReceiptItem,
    friendName,
    setFriendName,
    friendEmail,
    setFriendEmail,
    selectedFriendId,
    selectedFriend: ledger.members.find((member) => member.id === selectedFriendId) ?? null,
    openFriendProfile,
    editFriendName,
    setEditFriendName,
    editFriendContact,
    setEditFriendContact,
    editFriendPayment,
    setEditFriendPayment,
    addFriend,
    saveFriendProfile,
    removeFriendProfile,
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
    pushRegistrationStatus,
    scheduledReminders,
    cloudRecurringSchedules,
    recurringCloudStatus,
    requestReminderPermission,
    scheduleRecurringReminders,
    registerPushNotifications,
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
    loadCloudRecurringSchedules,
    runCloudRecurringAction,
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
                {!selectedExpense && activeTab === 'home' && <HomeScreen state={appState} />}
                {!selectedExpense && activeTab === 'activity' && <ActivityScreen state={appState} />}
                {!selectedExpense && activeTab === 'groups' && (groupSettingsOpen ? <GroupSettingsScreen state={appState} /> : <GroupsScreen state={appState} />)}
                {!selectedExpense && activeTab === 'add' && <AddExpenseScreen state={appState} />}
                {!selectedExpense && activeTab === 'balances' && <BalancesScreen state={appState} />}
                {!selectedExpense && activeTab === 'settings' && <MoreScreen state={appState} />}
              </YStack>
            </ScrollView>
          </YStack>
        </YStack>
        {!isWideLayout ? <BottomNav activeTab={activeTab} onChange={handlePrimaryRouteChange} unreadNotificationCount={unreadNotificationCount} /> : null}
      </XStack>
    </SafeAreaView>
  )
}
