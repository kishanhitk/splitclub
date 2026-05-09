import {
  BarChart3,
  Bell,
  CircleDollarSign,
  Home,
  Plus,
  ReceiptText,
  Repeat,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
  WalletCards,
  Wrench,
} from 'lucide-react-native'
import { currencyCodes } from '../domain/currencies'

export const splitModes = ['equal', 'exact', 'percent', 'shares', 'adjustment']
export const currencies = currencyCodes
export const expenseKinds = ['expense', 'refund', 'reimbursement', 'debt']
export const categories = ['General', 'Transport', 'Food', 'Lodging', 'Rent', 'Groceries', 'Utilities', 'Tickets']
export const groupRoles = ['owner', 'admin', 'member', 'viewer']
export const recurrenceOptions = ['none', 'weekly', 'monthly', 'yearly']
export const paymentMethods = ['cash', 'upi', 'paytm', 'venmo', 'paypal', 'bank']
export const paymentStatuses = ['recorded', 'pending', 'confirmed']
export const groupViews = [
  { id: 'overview', label: 'Overview' },
  { id: 'friends', label: 'Friends' },
  { id: 'invites', label: 'Invites' },
]
export const addExpenseSteps = [
  { id: 'basics', label: 'Basics' },
  { id: 'payers', label: 'Payers' },
  { id: 'split', label: 'Split' },
  { id: 'receipt', label: 'Receipt' },
  { id: 'review', label: 'Review' },
]

export const navItems = [
  { id: 'home', label: 'Home', description: 'Today, balances, next actions', icon: Home },
  { id: 'activity', label: 'Activity', description: 'Ledger, search, comments', icon: ReceiptText },
  { id: 'groups', label: 'Groups', description: 'Members, invites, defaults', icon: Users },
  { id: 'add', label: 'Add', description: 'Create or itemize a bill', icon: Plus },
  { id: 'balances', label: 'Balances', description: 'Settle up and simplify', icon: WalletCards },
  { id: 'settings', label: 'More', description: 'Account, sync, exports', icon: Settings },
]

export const mobileNavItems = navItems.filter((item) => item.id !== 'balances')

export const moreDestinations = [
  { id: 'account', label: 'Account', description: 'Profile, privacy, and sign-in', icon: UserCircle },
  { id: 'balances', label: 'Balances', description: 'Friend totals, net balances, and settle-up', icon: WalletCards },
  { id: 'notifications', label: 'Notifications', description: 'Recent changes and unread activity', icon: Bell },
  { id: 'privacy', label: 'Privacy', description: 'Visibility rules and private expenses', icon: ShieldCheck },
  { id: 'currencies', label: 'Currencies', description: 'Rates, defaults, and group conversion', icon: CircleDollarSign },
  { id: 'recurring', label: 'Recurring', description: 'Bills and native reminder scheduling', icon: Repeat },
  { id: 'analytics', label: 'Analytics', description: 'Category spend and monthly trends', icon: BarChart3 },
  { id: 'tools', label: 'Tools', description: 'Export, restore, storage, and sync utilities', icon: Wrench },
]
