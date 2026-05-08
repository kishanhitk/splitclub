import { StatusBar } from 'expo-status-bar'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  Bell,
  Camera,
  Check,
  Cloud,
  CreditCard,
  Download,
  Filter,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  Users,
  WalletCards,
} from 'lucide-react-native'
import { seedLedger } from './src/data/seed'
import {
  calculateBalances,
  exportCsv,
  searchExpenses,
  simplifyDebts,
  spendingByCategory,
  type Expense,
  type Ledger,
  type SplitMode,
} from './src/domain/split'
import { loadLedger, resetLedger, saveLedger } from './src/storage/offline'

const splitModes: SplitMode[] = ['equal', 'exact', 'percent', 'shares', 'adjustment']
const currencies = ['INR', 'USD', 'EUR', 'GBP', 'SGD']

export default function App() {
  const [ledger, setLedger] = useState<Ledger>(seedLedger)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null | undefined>('goa')
  const [query, setQuery] = useState('')
  const [splitMode, setSplitMode] = useState<SplitMode>('equal')
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

  const selectedGroup = ledger.groups.find((group) => group.id === selectedGroupId) ?? null
  const visibleExpenses = useMemo(() => searchExpenses(ledger, query), [ledger, query])
  const balances = useMemo(() => calculateBalances(ledger, selectedGroupId, currency), [ledger, selectedGroupId, currency])
  const settlements = useMemo(() => simplifyDebts(balances, currency), [balances, currency])
  const categoryTotals = useMemo(
    () => spendingByCategory(ledger, selectedGroupId, currency).slice(0, 5),
    [ledger, selectedGroupId, currency],
  )
  const totalSpending = categoryTotals.reduce((sum, item) => sum + item.amount, 0)

  const membersForGroup = selectedGroup
    ? ledger.members.filter((member) => selectedGroup.memberIds.includes(member.id))
    : ledger.members.slice(0, 2)

  const memberName = (memberId: string) => ledger.members.find((member) => member.id === memberId)?.name ?? 'Someone'

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

    const expense: Expense = {
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
  }

  const addSettlement = (from: string, to: string, settlementAmount: number) => {
    const settlement: Expense = {
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
    setSyncState('Demo data restored')
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.kicker}>SplitClub</Text>
            <Text style={styles.title}>Shared expenses, settled cleanly.</Text>
          </View>
          <View style={styles.syncPill}>
            <Cloud size={15} color="#0f766e" />
            <Text style={styles.syncText}>{syncState}</Text>
          </View>
        </View>

        <View style={styles.summaryBand}>
          <SummaryMetric label="Groups" value={ledger.groups.length.toString()} />
          <SummaryMetric label="Friends" value={ledger.members.length.toString()} />
          <SummaryMetric label="Bills" value={ledger.expenses.length.toString()} />
        </View>

        <Section title="Groups and friends" icon={<Users size={18} color="#111827" />}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowScroller}>
            <GroupChip label="All activity" selected={selectedGroupId === undefined} onPress={() => setSelectedGroupId(undefined)} />
            <GroupChip label="Non-group" selected={selectedGroupId === null} onPress={() => setSelectedGroupId(null)} />
            {ledger.groups.map((group) => (
              <GroupChip
                key={group.id}
                label={`${group.emoji} ${group.name}`}
                selected={selectedGroupId === group.id}
                onPress={() => {
                  setSelectedGroupId(group.id)
                  setCurrency(group.defaultCurrency)
                }}
              />
            ))}
          </ScrollView>
          <View style={styles.memberGrid}>
            {membersForGroup.map((member) => (
              <View key={member.id} style={styles.memberTile}>
                <Text style={styles.avatar}>{member.avatar}</Text>
                <View style={styles.flex}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.subtle}>{member.preferredPayment}</Text>
                </View>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Add bill" icon={<Plus size={18} color="#111827" />}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What was this for?"
            style={styles.input}
            placeholderTextColor="#8a94a6"
          />
          <View style={styles.inputRow}>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="Amount"
              style={[styles.input, styles.amountInput]}
              placeholderTextColor="#8a94a6"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.currencyRow}>
              {currencies.map((code) => (
                <Pressable
                  key={code}
                  onPress={() => setCurrency(code)}
                  style={[styles.currencyChip, currency === code && styles.currencyChipActive]}
                >
                  <Text style={[styles.currencyText, currency === code && styles.currencyTextActive]}>{code}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <Text style={styles.label}>Split method</Text>
          <View style={styles.segmented}>
            {splitModes.map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setSplitMode(mode)}
                style={[styles.segment, splitMode === mode && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, splitMode === mode && styles.segmentTextActive]}>{mode}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.primaryButton} onPress={addExpense}>
            <Plus size={18} color="#ffffff" />
            <Text style={styles.primaryButtonText}>Add expense</Text>
          </Pressable>
        </Section>

        <Section title="Balances and settle up" icon={<WalletCards size={18} color="#111827" />}>
          {balances.map((balance) => (
            <View key={balance.memberId} style={styles.balanceRow}>
              <View>
                <Text style={styles.memberName}>{memberName(balance.memberId)}</Text>
                <Text style={styles.subtle}>{balance.amount >= 0 ? 'gets back' : 'owes'}</Text>
              </View>
              <Text style={[styles.balanceAmount, balance.amount < 0 && styles.negative]}>
                {currency} {Math.abs(balance.amount).toFixed(2)}
              </Text>
            </View>
          ))}
          <View style={styles.settlementBox}>
            <Text style={styles.label}>Simplified payments</Text>
            {settlements.map((settlement) => (
              <Pressable
                key={`${settlement.from}-${settlement.to}-${settlement.amount}`}
                style={styles.settlementRow}
                onPress={() => addSettlement(settlement.from, settlement.to, settlement.amount)}
              >
                <Check size={16} color="#0f766e" />
                <Text style={styles.settlementText}>
                  {memberName(settlement.from)} pays {memberName(settlement.to)} {settlement.currency}{' '}
                  {settlement.amount.toFixed(2)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="Search, filters, and history" icon={<Search size={18} color="#111827" />}>
          <View style={styles.searchBox}>
            <Search size={17} color="#697386" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search notes, category, currency, receipt"
              style={styles.searchInput}
              placeholderTextColor="#8a94a6"
            />
            <Filter size={17} color="#697386" />
          </View>
          {visibleExpenses.slice(0, 6).map((expense) => (
            <View key={expense.id} style={styles.expenseRow}>
              <View style={styles.expenseIcon}>
                <ReceiptText size={17} color="#0f766e" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.expenseTitle}>{expense.description}</Text>
                <Text style={styles.subtle}>
                  {expense.category} - {expense.splitMode} - {expense.date}
                </Text>
              </View>
              <Text style={styles.expenseAmount}>
                {expense.currency} {expense.amount.toFixed(0)}
              </Text>
            </View>
          ))}
        </Section>

        <Section title="Spending totals" icon={<CreditCard size={18} color="#111827" />}>
          {categoryTotals.map((item) => (
            <View key={item.category} style={styles.chartRow}>
              <Text style={styles.chartLabel}>{item.category}</Text>
              <View style={styles.chartTrack}>
                <View style={[styles.chartFill, { width: `${Math.max((item.amount / Math.max(totalSpending, 1)) * 100, 8)}%` }]} />
              </View>
              <Text style={styles.chartAmount}>{item.amount.toFixed(0)}</Text>
            </View>
          ))}
        </Section>

        <Section title="Receipts, recurring bills, export" icon={<Camera size={18} color="#111827" />}>
          <View style={styles.featureGrid}>
            <FeatureTile icon={<Camera size={18} color="#0f766e" />} title="Receipt scan" body="Attach a receipt and itemize who had what." />
            <FeatureTile icon={<Bell size={18} color="#0f766e" />} title="Recurring" body="Weekly, monthly, yearly bills with reminders." />
            <FeatureTile icon={<RefreshCcw size={18} color="#0f766e" />} title="Convert" body="Convert group balances into the default currency." />
            <FeatureTile icon={<Download size={18} color="#0f766e" />} title="Export" body="Download a spreadsheet-ready transaction log." />
          </View>
          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButton} onPress={shareExport}>
              <Download size={17} color="#0f172a" />
              <Text style={styles.secondaryButtonText}>Export CSV</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={restoreDemo}>
              <RefreshCcw size={17} color="#0f172a" />
              <Text style={styles.secondaryButtonText}>Reset demo</Text>
            </Pressable>
          </View>
        </Section>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Built for Android and web first. Cloud sync, D1 storage, R2 receipts, and Worker API are wired as the backend direction.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

function GroupChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.groupChip, selected && styles.groupChipActive]}>
      <Text style={[styles.groupChipText, selected && styles.groupChipTextActive]}>{label}</Text>
    </Pressable>
  )
}

function FeatureTile({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <View style={styles.featureTile}>
      {icon}
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.subtle}>{body}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f6f7f4',
  },
  screen: {
    gap: 14,
    padding: 16,
    paddingBottom: 36,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  topBar: {
    gap: 14,
    paddingTop: 10,
  },
  kicker: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#101827',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: 0,
    maxWidth: 440,
  },
  syncPill: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    backgroundColor: '#e7f4ef',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  syncText: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryBand: {
    backgroundColor: '#111827',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  metric: {
    minWidth: 86,
  },
  metricValue: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#bac4d1',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  section: {
    backgroundColor: '#ffffff',
    borderColor: '#e4e7ec',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
  rowScroller: {
    gap: 8,
    paddingRight: 8,
  },
  groupChip: {
    backgroundColor: '#f1f4f2',
    borderColor: '#dde5e0',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  groupChipActive: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  groupChipText: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '800',
  },
  groupChipTextActive: {
    color: '#ffffff',
  },
  memberGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberTile: {
    alignItems: 'center',
    backgroundColor: '#f8faf8',
    borderColor: '#edf0ed',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 142,
    padding: 10,
  },
  avatar: {
    backgroundColor: '#dff3ec',
    borderRadius: 999,
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  flex: {
    flex: 1,
  },
  memberName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  subtle: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderColor: '#dfe5e8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  amountInput: {
    flex: 0.7,
  },
  currencyRow: {
    gap: 6,
  },
  currencyChip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  currencyChipActive: {
    backgroundColor: '#111827',
  },
  currencyText: {
    color: '#344054',
    fontSize: 12,
    fontWeight: '900',
  },
  currencyTextActive: {
    color: '#ffffff',
  },
  label: {
    color: '#344054',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  segment: {
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  segmentActive: {
    backgroundColor: '#dff3ec',
  },
  segmentText: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '800',
  },
  segmentTextActive: {
    color: '#0f766e',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0f766e',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  balanceRow: {
    alignItems: 'center',
    borderBottomColor: '#eef1f4',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
  },
  balanceAmount: {
    color: '#0f766e',
    fontSize: 15,
    fontWeight: '900',
  },
  negative: {
    color: '#b42318',
  },
  settlementBox: {
    backgroundColor: '#f8faf8',
    borderRadius: 8,
    gap: 8,
    padding: 10,
  },
  settlementRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 5,
  },
  settlementText: {
    color: '#344054',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderColor: '#dfe5e8',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: '#111827',
    flex: 1,
    fontSize: 15,
  },
  expenseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  expenseIcon: {
    alignItems: 'center',
    backgroundColor: '#e7f4ef',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  expenseTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  expenseAmount: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  chartRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  chartLabel: {
    color: '#344054',
    fontSize: 12,
    fontWeight: '800',
    width: 78,
  },
  chartTrack: {
    backgroundColor: '#eef2f1',
    borderRadius: 999,
    flex: 1,
    height: 12,
    overflow: 'hidden',
  },
  chartFill: {
    backgroundColor: '#0f766e',
    borderRadius: 999,
    height: 12,
  },
  chartAmount: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'right',
    width: 58,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureTile: {
    backgroundColor: '#f8faf8',
    borderColor: '#edf0ed',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 10,
    width: '48.5%',
  },
  featureTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 9,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '900',
  },
  footer: {
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  footerText: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
})
