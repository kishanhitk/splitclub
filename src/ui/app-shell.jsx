import {
  ArrowLeft,
  Bell,
  Camera,
  Check,
  ChevronRight,
  CircleDollarSign,
  Cloud,
  Download,
  Home,
  ListFilter,
  LogIn,
  LogOut,
  MessageCircle,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  Share2,
  Settings,
  ShieldCheck,
  TrendingUp,
  Trash2,
  Users,
  WalletCards,
} from 'lucide-react-native'
import { Button, Input, SizableText, Text, XStack, YStack } from 'tamagui'
import { roundMoney } from '../domain/split'
import {
  addExpenseSteps,
  categories,
  currencies,
  expenseKinds,
  groupRoles,
  groupViews,
  mobileNavItems,
  moreDestinations,
  navItems,
  recurrenceOptions,
  splitModes,
} from './app-config'

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
  if (activeTab === 'home') {
    return {
      id: 'home',
      section: 'Workspace',
      title: 'Home',
      description: 'A focused start point for balances, recent bills, groups, and the next action.',
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

function memberRevision(member) {
  return member?.updatedAt ?? [member?.name, member?.email ?? '', member?.phone ?? '', member?.preferredPayment ?? 'cash'].join('|')
}

function groupRevision(group) {
  return group?.updatedAt ?? group?.deletedAt ?? group?.name
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

function HomeScreen({ state }) {
  const youAreOwed = state.friendBalanceSummaries
    .filter((summary) => summary.amount > 0)
    .reduce((sum, summary) => sum + summary.amount, 0)
  const youOwe = Math.abs(state.friendBalanceSummaries
    .filter((summary) => summary.amount < 0)
    .reduce((sum, summary) => sum + summary.amount, 0))
  const latestExpenses = state.visibleExpenses.slice(0, 3)
  const activeGroupCount = state.activeGroups.length
  const selectedGroupLabel = state.selectedGroup
    ? `${state.selectedGroup.name} · ${state.membersForGroup.length} members`
    : 'Non-group expenses'

  return (
    <>
      <Panel>
        <YStack gap="$4">
          <XStack ai="flex-start" jc="space-between" gap="$3">
            <YStack flex={1} minWidth={0}>
              <SizableText color="#71717a" size="$2" fontWeight="800" textTransform="uppercase">
                SplitClub
              </SizableText>
              <Text color="#09090b" fontSize={30} lineHeight={35} fontWeight="900">
                {state.activeUser.name}
              </Text>
              <Muted>{selectedGroupLabel}</Muted>
            </YStack>
            <YStack ai="center" jc="center" height={46} width={46} minWidth={46} br={999} bg="#09090b">
              <SizableText color="#ffffff" size="$3" fontWeight="900">
                {state.activeUser.avatar ?? state.activeUser.name.slice(0, 2).toUpperCase()}
              </SizableText>
            </YStack>
          </XStack>

          <XStack gap="$2" flexWrap="wrap">
            <BalanceMetric label="You are owed" value={`${state.currency} ${youAreOwed.toFixed(2)}`} />
            <BalanceMetric label="You owe" value={`${state.currency} ${youOwe.toFixed(2)}`} />
          </XStack>

          <XStack gap="$2" flexWrap="wrap">
            <SecondaryButton icon={<Plus size={16} color="#09090b" />} label="Add expense" onPress={() => state.setActiveTab('add')} />
            <SecondaryButton
              icon={<WalletCards size={16} color="#09090b" />}
              label="Settle up"
              onPress={() => {
                state.setMoreSection('balances')
                state.setActiveTab('settings')
              }}
            />
          </XStack>
        </YStack>
      </Panel>

      <Panel title="Next actions">
        <YStack gap="$2">
          <ActionRow
            icon={<Users size={17} color="#09090b" />}
            title={`${activeGroupCount} active groups`}
            body="Manage members, friends, invites, and group defaults."
            onPress={() => state.setActiveTab('groups')}
          />
          <ActionRow
            icon={<ReceiptText size={17} color="#09090b" />}
            title={`${state.visibleExpenses.length} visible expenses`}
            body="Search the ledger and open expense details."
            onPress={() => state.setActiveTab('activity')}
          />
          <ActionRow
            icon={<Bell size={17} color="#09090b" />}
            title={`${state.unreadNotificationCount} unread updates`}
            body="Review account activity and recurring bill notices."
            onPress={() => {
              state.setMoreSection('notifications')
              state.setActiveTab('settings')
            }}
          />
        </YStack>
      </Panel>

      <Panel title="Recent bills" actionLabel="All activity" onAction={() => state.setActiveTab('activity')}>
        {latestExpenses.map((expense) => (
          <ExpenseRow key={expense.id} expense={expense} onPress={() => state.openExpense(expense)} />
        ))}
        {latestExpenses.length === 0 ? <Muted>No expenses yet.</Muted> : null}
      </Panel>
    </>
  )
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
  const linkedReceipt = expense.receiptId ? state.cloudReceipts.find((receipt) => receipt.id === expense.receiptId) : null
  const receiptLabel = linkedReceipt?.fileName ?? expense.attachmentName ?? 'Receipt'
  const receiptMeta = expense.receiptId
    ? linkedReceipt
      ? `${linkedReceipt.ocrStatus} · ${linkedReceipt.extractedItems?.length ?? 0} items`
      : 'Cloud receipt linked'
    : 'Local attachment metadata only'
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
              ['Attachment', expense.receiptId ? `${receiptLabel} · ${receiptMeta}` : expense.attachmentName ?? 'No attachment'],
              ...(expense.paymentMethod
                ? [
                    ['Payment', `${expense.paymentMethod} · ${expense.paymentStatus ?? 'recorded'}`],
                    ['Reference', expense.paymentReference ?? 'No reference'],
                  ]
                : []),
            ]}
          />
          {expense.receiptId || expense.attachmentName ? (
            <YStack bg="#f4f4f5" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3" gap="$2">
              <XStack ai="center" jc="space-between" gap="$3">
                <YStack flex={1}>
                  <Text color="#09090b" fontSize={14} fontWeight="900">
                    {receiptLabel}
                  </Text>
                  <Muted>{receiptMeta}</Muted>
                </YStack>
                <ReceiptText size={18} color="#09090b" />
              </XStack>
              <XStack>
                <SecondaryButton icon={<Download size={16} color="#09090b" />} label={expense.receiptId ? 'Open receipt' : 'Attachment noted'} onPress={state.openSelectedExpenseReceipt} />
              </XStack>
            </YStack>
          ) : null}
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
          <XStack gap="$2" flexWrap="wrap">
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
        <XStack gap="$1.5" flexWrap="wrap">
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
            <XStack gap="$2" flexWrap="wrap">
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
            <XStack flexWrap="wrap" gap="$2">
              {state.membersForGroup.filter((member) => member.id !== state.activeUser.id).map((member) => (
                <Button key={member.id} unstyled width="48.5%" minWidth={150} onPress={() => state.openFriendProfile(member)}>
                  <YStack bg={state.selectedFriendId === member.id ? '#f4f4f5' : '#ffffff'} borderWidth={1} borderColor={state.selectedFriendId === member.id ? '#09090b' : '#e4e4e7'} br="$2" p="$3">
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
                </Button>
              ))}
              {state.membersForGroup.filter((member) => member.id !== state.activeUser.id).length === 0 ? <Muted>No friends in this view yet.</Muted> : null}
            </XStack>
          </Panel>

          {state.selectedFriend ? (
            <Panel title="Friend profile">
              <YStack gap="$3">
                <Field label="Name">
                  <Input value={state.editFriendName} onChangeText={state.setEditFriendName} placeholder="Friend name" {...inputProps} />
                </Field>
                <Field label="Email or phone">
                  <Input value={state.editFriendContact} onChangeText={state.setEditFriendContact} placeholder="friend@example.com" {...inputProps} />
                </Field>
                <Field label="Preferred payment">
                  <XStack gap="$1.5" flexWrap="wrap">
                    {state.paymentMethods.map((method) => (
                      <Chip key={method} label={method.toUpperCase()} active={state.editFriendPayment === method} onPress={() => state.setEditFriendPayment(method)} />
                    ))}
                  </XStack>
                </Field>
                <XStack gap="$2" flexWrap="wrap">
                  <SecondaryButton icon={<Pencil size={16} color="#09090b" />} label="Save friend" onPress={state.saveFriendProfile} />
                  <SecondaryButton icon={<Trash2 size={16} color="#09090b" />} label="Remove" onPress={state.removeFriendProfile} />
                </XStack>
              </YStack>
            </Panel>
          ) : null}

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
                <XStack gap="$1.5" flexWrap="wrap">
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
                  <XStack gap="$2" flexWrap="wrap" jc="flex-end">
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
                  <XStack gap="$1.5" flexWrap="wrap">
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
        <XStack gap="$2" flexWrap="wrap">
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
          <XStack gap="$1.5" flexWrap="wrap">
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
          <XStack gap="$1.5" flexWrap="wrap">
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
  const selectedReceipt = state.cloudReceipts.find((receipt) => receipt.id === state.selectedReceiptId) ?? null
  const receiptDelta = roundMoney(Number(state.amount || 0) - state.itemizedTotal)
  const unassignedReceiptItems = state.receiptItems.filter((item) => !item.assignedTo?.length)
  const latestReceiptReview = selectedReceipt?.reviewHistory?.[0]

  return (
    <>
      <Panel title="Expense flow">
        <XStack gap="$1" flexWrap="wrap">
          {addExpenseSteps.map((step) => (
            <Button
              key={step.id}
              unstyled
              flex={1}
              minWidth={58}
              bg={state.addExpenseStep === step.id ? '#09090b' : '#f4f4f5'}
              borderWidth={1}
              borderColor={state.addExpenseStep === step.id ? '#09090b' : '#e4e4e7'}
              br="$1"
              px="$1"
              py="$2.5"
              ai="center"
              onPress={() => state.setAddExpenseStep(step.id)}
              pressStyle={{ scale: 0.98, bg: state.addExpenseStep === step.id ? '#18181b' : '#ffffff' }}
            >
              <SizableText
                color={state.addExpenseStep === step.id ? '#ffffff' : '#3f3f46'}
                size="$2"
                fontWeight="900"
                numberOfLines={1}
              >
                {step.label}
              </SizableText>
            </Button>
          ))}
        </XStack>
      </Panel>

      {state.addExpenseStep === 'basics' ? (
        <Panel title="Basics">
          <YStack gap="$3">
            <Field label="Type">
              <XStack gap="$1.5" flexWrap="wrap">
                {expenseKinds.map((kind) => (
                  <Chip key={kind} label={kind} active={state.expenseKind === kind} onPress={() => state.setExpenseKind(kind)} />
                ))}
              </XStack>
            </Field>
            <Field label="Description">
              <Input value={state.description} onChangeText={state.setDescription} placeholder="What was this for?" {...inputProps} />
            </Field>
            <XStack gap="$2" flexWrap="wrap">
              <YStack flex={1} minWidth={180} gap="$2">
                <Label>Amount</Label>
                <Input value={state.amount} onChangeText={state.setAmount} keyboardType="decimal-pad" placeholder="0.00" {...inputProps} />
              </YStack>
              <YStack flex={1} minWidth={180} gap="$2">
                <Label>Currency</Label>
                <XStack gap="$1.5" flexWrap="wrap">
                  {currencies.map((code) => (
                    <Chip key={code} label={code} active={state.currency === code} onPress={() => state.setCurrency(code)} />
                  ))}
                </XStack>
              </YStack>
            </XStack>
            <Field label="Category">
              <XStack gap="$1.5" flexWrap="wrap">
                {categories.map((category) => (
                  <Chip key={category} label={category} active={state.category === category} onPress={() => state.setCategory(category)} />
                ))}
              </XStack>
            </Field>
            <Field label="Date">
              <Input value={state.date} onChangeText={state.setDate} placeholder="YYYY-MM-DD" {...inputProps} />
            </Field>
            <Field label="Recurring bill">
              <XStack gap="$1.5" flexWrap="wrap">
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
              <XStack gap="$1.5" flexWrap="wrap">
                {state.membersForGroup.map((member) => (
                  <Chip key={member.id} label={member.name} active={state.paidBy === member.id} onPress={() => state.setPaidBy(member.id)} />
                ))}
              </XStack>
            </Field>
            <Field label="Payer mode">
              <XStack gap="$1.5" flexWrap="wrap">
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
              <XStack gap="$1.5" flexWrap="wrap">
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
              <XStack flexWrap="wrap" gap="$2">
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
            <XStack gap="$2" flexWrap="wrap">
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
            {state.cloudReceipts.slice(0, 3).map((receipt) => {
              const latestReview = receipt.reviewHistory?.[0]
              const selected = state.selectedReceiptId === receipt.id
              const reviewLabel = latestReview
                ? `${receipt.reviewHistory.length} reviews · ${latestReview.action}`
                : new Date(receipt.createdAt).toLocaleDateString()
              const lifecycleLabel = [receipt.expenseId ? 'attached' : null, selected ? 'selected' : null].filter(Boolean).join(' · ')
              return (
                <XStack key={receipt.id} ai="center" jc="space-between" gap="$3" py="$2" borderTopWidth={1} borderColor="#f4f4f5">
                  <YStack flex={1}>
                    <Text color="#09090b" fontSize={14} fontWeight="900">
                      {receipt.fileName}
                    </Text>
                    <Muted>
                      {receipt.ocrStatus} · {receipt.extractedItems?.length ?? 0} items · {reviewLabel}
                    </Muted>
                    {lifecycleLabel ? <Muted>{lifecycleLabel}</Muted> : null}
                  </YStack>
                  <XStack gap="$3">
                    <Button unstyled onPress={() => state.openCloudReceipt(receipt.id)}>
                      <SizableText color="#71717a" size="$2" fontWeight="900">
                        Open
                      </SizableText>
                    </Button>
                    <Button unstyled onPress={() => state.retryCloudReceipt(receipt.id)}>
                      <SizableText color="#71717a" size="$2" fontWeight="900">
                        Retry
                      </SizableText>
                    </Button>
                    <Button unstyled onPress={() => state.applyCloudReceipt(receipt.id)}>
                      <SizableText color="#09090b" size="$2" fontWeight="900">
                        Use
                      </SizableText>
                    </Button>
                  </XStack>
                </XStack>
              )
            })}
          </YStack>
          <YStack bg="#fafafa" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3" gap="$3">
            <XStack ai="center" jc="space-between" gap="$3">
              <YStack flex={1}>
                <Text color="#09090b" fontSize={14} fontWeight="900">
                  Review before saving
                </Text>
                <Muted>
                  {selectedReceipt ? `${selectedReceipt.fileName} · ${selectedReceipt.reviewHistory?.length ?? 0} lifecycle events` : 'Upload or select a cloud receipt to track review history.'}
                </Muted>
              </YStack>
              <ReceiptText size={18} color="#09090b" />
            </XStack>
            <YStack gap="$1.5">
              <StatusLine label="Expense total" value={`${state.currency} ${Number(state.amount || 0).toFixed(2)}`} />
              <StatusLine label="Itemized total" value={`${state.currency} ${state.itemizedTotal.toFixed(2)}`} />
              <StatusLine
                label="Difference"
                value={receiptDelta === 0 ? 'Matched' : `${receiptDelta > 0 ? '+' : '-'}${state.currency} ${Math.abs(receiptDelta).toFixed(2)}`}
              />
              <StatusLine label="Unassigned lines" value={unassignedReceiptItems.length ? `${unassignedReceiptItems.length} need assignment` : 'All assigned'} />
              <StatusLine label="Latest review" value={latestReceiptReview ? `${latestReceiptReview.action} · ${latestReceiptReview.itemCount} items` : 'Not reviewed'} />
            </YStack>
            <XStack gap="$2" flexWrap="wrap">
              <SecondaryButton icon={<Check size={16} color="#09090b" />} label="Mark reviewed" onPress={state.markReceiptReviewed} />
              <SecondaryButton icon={<ListFilter size={16} color="#09090b" />} label="Use itemized split" onPress={state.applyItemizedSplit} />
            </XStack>
          </YStack>
          <Field label="OCR text">
            <Input value={state.receiptOcrText} onChangeText={state.setReceiptOcrText} placeholder="Item name 12.34" {...inputProps} />
          </Field>
          <SecondaryButton icon={<ListFilter size={16} color="#09090b" />} label="Extract for review" onPress={state.extractReceiptPreview} />
          <XStack gap="$2" flexWrap="wrap">
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
                <XStack gap="$1.5" flexWrap="wrap">
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
            <XStack gap="$1.5" flexWrap="wrap">
              {state.paymentMethods.map((method) => (
                <Chip key={method} label={method.toUpperCase()} active={state.settlementMethod === method} onPress={() => state.setSettlementMethod(method)} />
              ))}
            </XStack>
          </Field>
          <Field label="Payment status">
            <XStack gap="$1.5" flexWrap="wrap">
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
        {state.moreSection === 'balances' ? <BalancesScreen state={state} /> : null}
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
            <XStack gap="$2" flexWrap="wrap">
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
          <YStack bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3" gap="$2.5">
            <XStack ai="center" jc="space-between" gap="$3">
              <YStack flex={1}>
                <Text color="#09090b" fontSize={14} fontWeight="900">
                  Provider
                </Text>
                <Muted>{state.authProviderStatus.message}</Muted>
              </YStack>
              <SizableText color="#09090b" size="$2" fontWeight="900">
                {state.authProviderStatus.provider}
              </SizableText>
            </XStack>
            <YStack gap="$1.5">
              <StatusLine label="App client" value={state.authProviderStatus.clientConfigured ? 'Ready' : 'Missing issuer or client ID'} />
              <StatusLine label="Worker" value={state.authProviderStatus.configured ? 'Ready' : 'Not configured'} />
              <StatusLine label="Issuer" value={state.authProviderStatus.issuerHost ?? 'Not checked'} />
              <StatusLine label="Claims" value={(state.authProviderStatus.requiredClaims ?? []).join(', ') || 'sub, iss, aud'} />
            </YStack>
            <XStack gap="$2" flexWrap="wrap">
              <SecondaryButton
                icon={<RefreshCcw size={16} color="#09090b" />}
                label={state.authProviderStatus.loading ? 'Checking' : 'Check provider'}
                onPress={state.loadAuthProviderStatus}
              />
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
            <XStack gap="$1.5" flexWrap="wrap">
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
          <XStack gap="$1.5" flexWrap="wrap">
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
          <XStack gap="$1.5" flexWrap="wrap">
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
            <XStack gap="$1.5" flexWrap="wrap">
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
                <XStack gap="$2" flexWrap="wrap">
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
                <Muted>{state.pushRegistrationStatus}</Muted>
              </YStack>
              <Bell size={18} color="#09090b" />
            </XStack>
            <YStack gap="$2">
              <XStack gap="$2">
                <SecondaryButton icon={<Bell size={16} color="#09090b" />} label="Enable" onPress={state.requestReminderPermission} />
                <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label="Schedule" onPress={state.scheduleRecurringReminders} />
              </XStack>
              <XStack gap="$2">
                <SecondaryButton icon={<Cloud size={16} color="#09090b" />} label="Register push" onPress={state.registerPushNotifications} />
                <SecondaryButton icon={<Cloud size={16} color="#09090b" />} label="Cloud" onPress={state.loadCloudRecurringSchedules} />
              </XStack>
            </YStack>
          </YStack>
          {state.cloudRecurringSchedules.length ? (
            <YStack gap="$2">
              <Muted>{state.recurringCloudStatus}</Muted>
              {state.cloudRecurringSchedules.slice(0, 3).map((schedule) => (
                <YStack key={schedule.sourceExpenseId} gap="$2" py="$2" borderTopWidth={1} borderColor="#f4f4f5">
                  <YStack>
                    <Text color="#09090b" fontSize={14} fontWeight="900">
                      {schedule.description}
                    </Text>
                    <Muted>
                      cloud · due {schedule.dueDate} · {schedule.history?.length ?? 0} events
                    </Muted>
                  </YStack>
                  <XStack gap="$2">
                    <SecondaryButton icon={<Check size={16} color="#09090b" />} label="Post" onPress={() => state.runCloudRecurringAction(schedule.sourceExpenseId, 'post')} />
                    <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label="Skip" onPress={() => state.runCloudRecurringAction(schedule.sourceExpenseId, 'skip')} />
                  </XStack>
                </YStack>
              ))}
            </YStack>
          ) : <Muted>{state.recurringCloudStatus}</Muted>}
          {state.upcomingRecurring.map((expense) => (
            <YStack key={expense.sourceExpenseId} gap="$3" bg="#ffffff" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3">
              <XStack ai="center" jc="space-between" gap="$3">
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
              </XStack>
              <XStack gap="$2">
                <SecondaryButton icon={<Check size={16} color="#09090b" />} label="Post" onPress={() => state.postRecurringOccurrence(expense.sourceExpenseId)} />
                <SecondaryButton icon={<RefreshCcw size={16} color="#09090b" />} label="Cancel" onPress={() => state.cancelRecurring(expense.sourceExpenseId)} />
              </XStack>
            </YStack>
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

function BottomNav({ activeTab, onChange, unreadNotificationCount }) {
  return (
    <YStack position="absolute" left={0} right={0} bottom={0} bg="#ffffff" borderTopWidth={1} borderColor="#e5e5e5" px="$3" pt="$2" pb="$3">
      <XStack maxWidth={820} width="100%" alignSelf="center" jc="space-between" gap="$1">
        {mobileNavItems.map((item) => {
          const Icon = item.icon
          const active = activeTab === item.id
          const badge = item.id === 'settings' && unreadNotificationCount > 0 ? unreadNotificationCount : null
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
              <YStack>
                <Icon size={18} color={active ? '#ffffff' : '#52525b'} />
                {badge ? (
                  <YStack position="absolute" top={-7} right={-10} ai="center" jc="center" minWidth={16} h={16} br={999} bg={active ? '#ffffff' : '#09090b'} px="$1">
                    <SizableText color={active ? '#09090b' : '#ffffff'} size="$1" fontWeight="900">
                      {badge > 9 ? '9+' : badge}
                    </SizableText>
                  </YStack>
                ) : null}
              </YStack>
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

function BalanceMetric({ label, value }) {
  return (
    <YStack flex={1} minWidth={148} bg="#fafafa" borderWidth={1} borderColor="#e4e4e7" br="$2" p="$3" gap="$1">
      <SizableText color="#71717a" size="$2" fontWeight="800" ta="left">
        {label}
      </SizableText>
      <Text color="#09090b" fontSize={20} lineHeight={25} fontWeight="900" ta="left">
        {value}
      </Text>
    </YStack>
  )
}

function ActionRow({ icon, title, body, onPress }) {
  return (
    <XStack
      width="100%"
      ai="center"
      gap="$3"
      py="$2.5"
      borderBottomWidth={1}
      borderColor="#f4f4f5"
      onPress={onPress}
      pressStyle={{ opacity: 0.72 }}
    >
      <YStack ai="center" jc="center" height={38} width={38} minWidth={38} br="$2" bg="#f4f4f5">
        {icon}
      </YStack>
      <YStack flex={1} minWidth={0} ai="flex-start">
        <Text width="100%" color="#09090b" fontSize={15} fontWeight="900" ta="left">
          {title}
        </Text>
        <SizableText width="100%" color="#71717a" size="$2" lineHeight={17} ta="left">
          {body}
        </SizableText>
      </YStack>
      <ChevronRight size={17} color="#71717a" />
    </XStack>
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

function StatusLine({ label, value }) {
  return (
    <XStack ai="center" jc="space-between" gap="$3">
      <Muted>{label}</Muted>
      <SizableText color="#09090b" size="$2" fontWeight="900" flex={1} ta="right">
        {value}
      </SizableText>
    </XStack>
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

export {
  Header,
  buildRouteMeta,
  buildSplitPreview,
  ensureSplitValues,
  splitsToValues,
  valuesToSplits,
  payerValuesWithFallback,
  downloadTextFile,
  replaceRecord,
  expenseRevision,
  memberRevision,
  groupRevision,
  syncSummaryWithConflicts,
  HomeScreen,
  ActivityScreen,
  ExpenseDetailScreen,
  GroupsScreen,
  GroupSettingsScreen,
  AddExpenseScreen,
  BalancesScreen,
  MoreScreen,
  DesktopNav,
  BottomNav,
}
