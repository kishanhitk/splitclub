import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo, useState } from 'react'
import { Alert, Platform, SafeAreaView } from 'react-native'
import {
  Bell,
  Camera,
  Check,
  CircleDollarSign,
  Download,
  Home,
  ListFilter,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  Settings,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react-native'
import { Button, Input, ScrollView, SizableText, TamaguiProvider, Text, XStack, YStack } from 'tamagui'
import { seedLedger } from './src/data/seed'
import {
  calculateBalances,
  exportCsv,
  searchExpenses,
  simplifyDebts,
  spendingByCategory,
} from './src/domain/split'
import { loadLedger, resetLedger, saveLedger } from './src/storage/offline'
import { tamaguiConfig } from './tamagui.config'

const splitModes = ['equal', 'exact', 'percent', 'shares', 'adjustment']
const currencies = ['INR', 'USD', 'EUR', 'GBP', 'SGD']

const navItems = [
  { id: 'activity', label: 'Activity', icon: ReceiptText },
  { id: 'groups', label: 'Groups', icon: Users },
  { id: 'add', label: 'Add', icon: Plus },
  { id: 'balances', label: 'Balances', icon: WalletCards },
  { id: 'settings', label: 'Settings', icon: Settings },
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
  const [query, setQuery] = useState('')
  const [splitMode, setSplitMode] = useState('equal')
  const [amount, setAmount] = useState('3600')
  const [description, setDescription] = useState('Airport cab')
  const [currency, setCurrency] = useState('INR')
  const [syncState, setSyncState] = useState('Offline ready')

  useEffect(() => {
    loadLedger()
      .then(setLedger)
      .catch(() => setLedger(seedLedger))
  }, [])

  useEffect(() => {
    saveLedger(ledger).catch(() => setSyncState('Local save failed'))
  }, [ledger])

  const selectedGroup = selectedGroupId
    ? ledger.groups.find((group) => group.id === selectedGroupId)
    : null
  const membersForGroup = selectedGroup
    ? ledger.members.filter((member) => selectedGroup.memberIds.includes(member.id))
    : ledger.members.slice(0, 2)
  const visibleExpenses = useMemo(() => searchExpenses(ledger, query), [ledger, query])
  const balances = useMemo(() => calculateBalances(ledger, selectedGroupId, currency), [ledger, selectedGroupId, currency])
  const settlements = useMemo(() => simplifyDebts(balances, currency), [balances, currency])
  const categoryTotals = useMemo(
    () => spendingByCategory(ledger, selectedGroupId, currency).slice(0, 5),
    [ledger, selectedGroupId, currency],
  )
  const totalSpending = categoryTotals.reduce((sum, item) => sum + item.amount, 0)
  const currentTitle = navItems.find((item) => item.id === activeTab)?.label ?? 'Activity'

  const memberName = (memberId) => ledger.members.find((member) => member.id === memberId)?.name ?? 'Someone'

  const addExpense = () => {
    const numericAmount = Number(amount)
    if (!description.trim() || Number.isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Check the bill', 'Add a description and a valid amount.')
      return
    }

    const participants = membersForGroup.map((member) => member.id)
    const splits = participants.map((memberId, index) => {
      if (splitMode === 'percent') return { memberId, value: index === 0 ? 40 : 60 / Math.max(participants.length - 1, 1) }
      if (splitMode === 'shares') return { memberId, value: index === 0 ? 2 : 1 }
      return { memberId, value: numericAmount / participants.length }
    })

    const expense = {
      id: `expense-${Date.now()}`,
      groupId: selectedGroupId ?? null,
      description: description.trim(),
      amount: numericAmount,
      currency,
      paidBy: participants[0],
      participants,
      splitMode,
      splits: splitMode === 'equal' ? [] : splits,
      category: splitMode === 'adjustment' ? 'Adjustment' : 'Transport',
      kind: 'expense',
      date: new Date().toISOString().slice(0, 10),
      notes: `${splitMode} split created on ${Platform.OS}`,
      recurrence: 'none',
    }

    setLedger((current) => ({ ...current, expenses: [expense, ...current.expenses] }))
    setSyncState('Saved locally')
    setActiveTab('activity')
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
      date: new Date().toISOString().slice(0, 10),
    }
    setLedger((current) => ({ ...current, expenses: [settlement, ...current.expenses] }))
    setSyncState('Settlement recorded')
  }

  const shareExport = () => {
    const csv = exportCsv(ledger)
    if (Platform.OS === 'web') {
      setSyncState(`CSV ready: ${csv.split('\n').length - 1} rows`)
      return
    }
    Alert.alert('CSV export ready', `${csv.split('\n').length - 1} rows prepared.`)
  }

  const restoreDemo = async () => {
    const restored = await resetLedger()
    setLedger(restored)
    setQuery('')
    setSyncState('Demo data restored')
  }

  const appState = {
    ledger,
    selectedGroup,
    selectedGroupId,
    setSelectedGroupId,
    activeTab,
    setActiveTab,
    query,
    setQuery,
    splitMode,
    setSplitMode,
    amount,
    setAmount,
    description,
    setDescription,
    currency,
    setCurrency,
    syncState,
    membersForGroup,
    visibleExpenses,
    balances,
    settlements,
    categoryTotals,
    totalSpending,
    memberName,
    addExpense,
    addSettlement,
    shareExport,
    restoreDemo,
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fafafa' }}>
      <StatusBar style="dark" />
      <YStack flex={1} bg="#fafafa">
        <Header title={currentTitle} selectedGroup={selectedGroup} syncState={syncState} />
        <YStack flex={1} maxWidth={820} width="100%" alignSelf="center">
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 104 }}>
            <YStack gap="$3" px="$4" pt="$3">
              {activeTab === 'activity' && <ActivityScreen state={appState} />}
              {activeTab === 'groups' && <GroupsScreen state={appState} />}
              {activeTab === 'add' && <AddExpenseScreen state={appState} />}
              {activeTab === 'balances' && <BalancesScreen state={appState} />}
              {activeTab === 'settings' && <SettingsScreen state={appState} />}
            </YStack>
          </ScrollView>
        </YStack>
        <BottomNav activeTab={activeTab} onChange={setActiveTab} />
      </YStack>
    </SafeAreaView>
  )
}

function Header({ title, selectedGroup, syncState }) {
  return (
    <YStack bg="#ffffff" borderBottomWidth={1} borderColor="#e5e5e5" px="$4" pt="$3" pb="$3">
      <YStack maxWidth={820} width="100%" alignSelf="center" gap="$2">
        <XStack ai="center" jc="space-between" gap="$3">
          <YStack>
            <SizableText color="#71717a" size="$2" fontWeight="800" textTransform="uppercase">
              SplitClub
            </SizableText>
            <Text color="#09090b" fontSize={26} lineHeight={31} fontWeight="900">
              {title}
            </Text>
          </YStack>
          <YStack ai="flex-end">
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

function ActivityScreen({ state }) {
  return (
    <>
      <Panel>
        <XStack ai="center" gap="$2" bg="#f4f4f5" br="$3" px="$3" h={44} borderWidth={1} borderColor="#e4e4e7">
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
          <ExpenseRow key={expense.id} expense={expense} />
        ))}
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
          {state.ledger.groups.map((group) => (
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

      <Panel title="Friends">
        <XStack fw="wrap" gap="$2">
          {state.membersForGroup.map((member) => (
            <YStack key={member.id} width="48.5%" minWidth={150} bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$3" p="$3">
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
    </>
  )
}

function AddExpenseScreen({ state }) {
  return (
    <>
      <Panel title="New expense">
        <YStack gap="$3">
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
          <Field label="Split method">
            <XStack gap="$1.5" fw="wrap">
              {splitModes.map((mode) => (
                <Chip key={mode} label={mode} active={state.splitMode === mode} onPress={() => state.setSplitMode(mode)} />
              ))}
            </XStack>
          </Field>
          <YStack bg="#f4f4f5" borderWidth={1} borderColor="#e4e4e7" br="$3" p="$3" gap="$2">
            <Label>Participants</Label>
            <XStack fw="wrap" gap="$2">
              {state.membersForGroup.map((member) => (
                <SizableText key={member.id} color="#18181b" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br={999} px="$3" py="$2" size="$2" fontWeight="800">
                  {member.name}
                </SizableText>
              ))}
            </XStack>
          </YStack>
          <PrimaryButton icon={<Plus size={17} color="#ffffff" />} label="Save expense" onPress={state.addExpense} />
        </YStack>
      </Panel>

      <Panel title="Production flows">
        <FeatureList
          rows={[
            ['Receipt itemization', 'Scan or attach a receipt, then assign each item to people.'],
            ['Recurring bills', 'Rent, utilities, subscriptions, and reminders stay separate from one-time bills.'],
            ['Split validation', 'Exact, percent, shares, and adjustments must reconcile before save.'],
          ]}
        />
      </Panel>
    </>
  )
}

function BalancesScreen({ state }) {
  return (
    <>
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
          {state.settlements.map((settlement) => (
            <Button
              key={`${settlement.from}-${settlement.to}-${settlement.amount}`}
              unstyled
              onPress={() => state.addSettlement(settlement.from, settlement.to, settlement.amount)}
            >
              <XStack ai="center" gap="$2" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$3" p="$3">
                <Check size={16} color="#09090b" />
                <SizableText color="#18181b" size="$3" fontWeight="800" flex={1}>
                  {state.memberName(settlement.from)} pays {state.memberName(settlement.to)}
                </SizableText>
                <SizableText color="#09090b" size="$3" fontWeight="900">
                  {settlement.currency} {settlement.amount.toFixed(2)}
                </SizableText>
              </XStack>
            </Button>
          ))}
        </YStack>
      </Panel>
    </>
  )
}

function SettingsScreen({ state }) {
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

      <Panel title="Tools">
        <FeatureList
          rows={[
            ['Receipt storage', 'R2-backed attachments and OCR pipeline.'],
            ['Currency conversion', 'Group and friend balances in selected currency.'],
            ['CSV export', 'Spreadsheet-ready expense and settlement history.'],
            ['Offline sync', 'Local-first ledger with future D1 conflict-safe sync.'],
          ]}
        />
        <XStack gap="$2" mt="$2">
          <SecondaryButton icon={<Download size={16} color="#09090b" />} label="Export CSV" onPress={state.shareExport} />
          <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label="Reset demo" onPress={state.restoreDemo} />
        </XStack>
      </Panel>
    </>
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
              br="$3"
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
    <YStack bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$4" gap="$3" p="$3.5">
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

function ExpenseRow({ expense }) {
  return (
    <XStack ai="center" gap="$2.5" py="$2.5" borderBottomWidth={1} borderColor="#f4f4f5">
      <YStack ai="center" jc="center" bg="#f4f4f5" br={999} h={36} w={36}>
        <ReceiptText size={17} color="#09090b" />
      </YStack>
      <YStack flex={1}>
        <Text color="#09090b" fontSize={15} fontWeight="900">
          {expense.description}
        </Text>
        <Muted>
          {expense.category} · {expense.splitMode} · {expense.date}
        </Muted>
      </YStack>
      <Text color="#09090b" fontSize={14} fontWeight="900">
        {expense.currency} {expense.amount.toFixed(0)}
      </Text>
    </XStack>
  )
}

function GroupButton({ label, meta, active, onPress }) {
  return (
    <Button unstyled onPress={onPress}>
      <XStack ai="center" jc="space-between" bg={active ? '#09090b' : '#ffffff'} borderWidth={1} borderColor="#e4e4e7" br="$3" p="$3">
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
        <XStack key={title} gap="$2.5" ai="flex-start" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$3" p="$3">
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
    <Button h={48} br="$3" bg="#09090b" color="#ffffff" onPress={onPress} pressStyle={{ bg: '#27272a', scale: 0.99 }}>
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
    <Button flex={1} h={44} br="$3" bg="#ffffff" borderColor="#e4e4e7" borderWidth={1} color="#09090b" onPress={onPress} pressStyle={{ bg: '#f4f4f5', scale: 0.99 }}>
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
