import { z } from 'zod'

export const splitModeSchema = z.enum(['equal', 'exact', 'percent', 'shares', 'adjustment'])
export const expenseKindSchema = z.enum(['expense', 'settlement', 'refund', 'reimbursement', 'debt'])
export const recurrenceSchema = z.enum(['none', 'weekly', 'monthly', 'yearly'])
export const paymentMethodSchema = z.enum(['cash', 'upi', 'venmo', 'paypal', 'bank'])
export const paymentStatusSchema = z.enum(['recorded', 'pending', 'confirmed'])

export const authUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  avatar: z.string().min(1).optional(),
  provider: z.string().min(1).default('oidc'),
})

export const authSessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresAt: z.string().min(1),
  user: authUserSchema,
})

export const memberSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(3).optional(),
  avatar: z.string().min(1).optional(),
  preferredPayment: z.enum(['cash', 'upi', 'venmo', 'paypal', 'bank']).default('cash'),
})

export const splitShareSchema = z.object({
  memberId: z.string().min(1),
  value: z.number().nonnegative(),
})

export const receiptItemSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1),
  amount: z.number().nonnegative(),
  assignedTo: z.array(z.string().min(1)).default([]),
})

export const expenseCommentSchema = z.object({
  body: z.string().trim().min(1).max(1000),
})

export const expenseSchema = z.object({
  id: z.string().min(1).optional(),
  groupId: z.string().min(1).nullable(),
  description: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  paidBy: z.string().min(1),
  participants: z.array(z.string().min(1)).min(1),
  splitMode: splitModeSchema,
  splits: z.array(splitShareSchema).default([]),
  category: z.string().min(1).default('General'),
  kind: expenseKindSchema.default('expense'),
  date: z.string().min(1),
  notes: z.string().optional(),
  attachmentName: z.string().optional(),
  receiptItems: z.array(receiptItemSchema).default([]),
  recurrence: recurrenceSchema.default('none'),
  reminderDays: z.number().int().nonnegative().optional(),
  paymentMethod: paymentMethodSchema.optional(),
  paymentReference: z.string().min(1).optional(),
  paymentStatus: paymentStatusSchema.optional(),
})

export const expenseUpdateSchema = z.object({
  groupId: z.string().min(1).nullable().optional(),
  description: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()).optional(),
  paidBy: z.string().min(1).optional(),
  participants: z.array(z.string().min(1)).min(1).optional(),
  splitMode: splitModeSchema.optional(),
  splits: z.array(splitShareSchema).optional(),
  category: z.string().min(1).optional(),
  kind: expenseKindSchema.optional(),
  date: z.string().min(1).optional(),
  notes: z.string().optional(),
  attachmentName: z.string().optional(),
  receiptItems: z.array(receiptItemSchema).optional(),
  recurrence: recurrenceSchema.optional(),
  reminderDays: z.number().int().nonnegative().optional(),
  paymentMethod: paymentMethodSchema.optional(),
  paymentReference: z.string().min(1).optional(),
  paymentStatus: paymentStatusSchema.optional(),
})

export const groupSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  emoji: z.string().min(1).default('G'),
  category: z.enum(['trip', 'home', 'couple', 'friends', 'project']).default('friends'),
  memberIds: z.array(z.string().min(1)).min(1),
  defaultCurrency: z.string().length(3).transform((value) => value.toUpperCase()).default('INR'),
  simplifyDebts: z.boolean().default(true),
  defaultSplitMode: splitModeSchema.default('equal'),
  defaultSplits: z.array(splitShareSchema).default([]),
})

export const friendSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(3).optional(),
  avatar: z.string().min(1).optional(),
  preferredPayment: z.enum(['cash', 'upi', 'venmo', 'paypal', 'bank']).default('cash'),
})

export const groupInviteSchema = z.object({
  groupId: z.string().min(1),
  invitedEmail: z.string().email().optional(),
  invitedPhone: z.string().min(3).optional(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).default('member'),
  createdBy: z.string().min(1).default('kishan'),
})

export const membershipSchema = z.object({
  groupId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).default('member'),
})

export const settlementSchema = z.object({
  id: z.string().min(1).optional(),
  groupId: z.string().min(1).nullable(),
  from: z.string().min(1),
  to: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  date: z.string().min(1),
  notes: z.string().optional(),
  paymentMethod: paymentMethodSchema.default('cash'),
  paymentReference: z.string().min(1).optional(),
  paymentStatus: paymentStatusSchema.default('recorded'),
})

export const searchSchema = z.object({
  q: z.string().default(''),
  groupId: z.string().min(1).nullable().optional(),
  currency: z.string().length(3).optional(),
})

export type MemberInput = z.infer<typeof memberSchema>
export type GroupInput = z.infer<typeof groupSchema>
export type FriendInput = z.infer<typeof friendSchema>
export type GroupInviteInput = z.infer<typeof groupInviteSchema>
export type MembershipInput = z.infer<typeof membershipSchema>
export type ExpenseInput = z.infer<typeof expenseSchema>
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>
export type ExpenseCommentInput = z.infer<typeof expenseCommentSchema>
export type SettlementInput = z.infer<typeof settlementSchema>
export type AuthUser = z.infer<typeof authUserSchema>
export type AuthSession = z.infer<typeof authSessionSchema>
