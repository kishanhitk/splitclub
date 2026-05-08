import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Ledger } from '../domain/split'
import { seedLedger } from '../data/seed'

const LEDGER_KEY = 'splitclub.ledger.v1'

export async function loadLedger(): Promise<Ledger> {
  const stored = await AsyncStorage.getItem(LEDGER_KEY)
  if (!stored) return seedLedger
  return JSON.parse(stored) as Ledger
}

export async function saveLedger(ledger: Ledger) {
  await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(ledger))
}

export async function resetLedger() {
  await AsyncStorage.removeItem(LEDGER_KEY)
  return seedLedger
}
