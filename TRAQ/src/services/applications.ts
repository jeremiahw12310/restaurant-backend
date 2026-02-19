import { 
  collection, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from '../firebase'

// Application status types
export type ApplicationStatus = 'new' | 'reviewed' | 'contacted' | 'hired' | 'rejected'

// Availability shift keys
export type ShiftKey = 
  | 'mon_lunch' | 'tue_lunch' | 'wed_lunch' | 'thu_lunch' | 'fri_lunch' | 'sat_lunch' | 'sun_lunch'
  | 'mon_dinner' | 'tue_dinner' | 'wed_dinner' | 'thu_dinner' | 'fri_dinner' | 'sat_dinner' | 'sun_dinner'

// Application document type
export type Application = {
  id: string
  name: string
  email: string
  birthDate: string // YYYY-MM-DD
  address: string
  phone: string
  availability: ShiftKey[]
  availabilityOther?: string
  employmentHistory: string
  felonyConviction: boolean
  status: ApplicationStatus
  createdAt: string // ISO timestamp
  createdAtMs: number
  notes?: string
}

// Data for creating a new application (without id and status)
export type NewApplicationData = Omit<Application, 'id' | 'status' | 'createdAt' | 'createdAtMs' | 'notes'>

/**
 * Submit a new job application
 */
export async function submitApplication(data: NewApplicationData): Promise<string> {
  const now = new Date()
  
  // Build document data, excluding undefined fields (Firestore doesn't accept undefined)
  const docData: Record<string, unknown> = {
    name: data.name,
    email: data.email,
    birthDate: data.birthDate,
    address: data.address,
    phone: data.phone,
    availability: data.availability,
    employmentHistory: data.employmentHistory,
    felonyConviction: data.felonyConviction,
    status: 'new' as ApplicationStatus,
    createdAt: now.toISOString(),
    createdAtMs: now.getTime(),
  }
  
  // Only add availabilityOther if it has a value
  if (data.availabilityOther) {
    docData.availabilityOther = data.availabilityOther
  }
  
  const docRef = await addDoc(collection(db, 'applications'), docData)
  return docRef.id
}

/**
 * Subscribe to all applications (for admin panel)
 * Returns an unsubscribe function
 */
export function subscribeToApplications(
  callback: (applications: Application[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'applications'),
    orderBy('createdAtMs', 'desc')
  )
  
  return onSnapshot(q, (snapshot) => {
    const applications: Application[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Application))
    callback(applications)
  })
}

/**
 * Update application status
 */
export async function updateApplicationStatus(
  id: string, 
  status: ApplicationStatus
): Promise<void> {
  const docRef = doc(db, 'applications', id)
  await updateDoc(docRef, { status })
}

/**
 * Add or update admin notes on an application
 */
export async function updateApplicationNotes(
  id: string, 
  notes: string
): Promise<void> {
  const docRef = doc(db, 'applications', id)
  await updateDoc(docRef, { notes })
}

/**
 * Delete an application
 */
export async function deleteApplication(id: string): Promise<void> {
  const docRef = doc(db, 'applications', id)
  await deleteDoc(docRef)
}

// Shift display labels
export const SHIFT_LABELS: Record<ShiftKey, string> = {
  mon_lunch: 'Monday 11am-5pm',
  tue_lunch: 'Tuesday 11am-5pm',
  wed_lunch: 'Wednesday 11am-5pm',
  thu_lunch: 'Thursday 11am-5pm',
  fri_lunch: 'Friday 11am-5pm',
  sat_lunch: 'Saturday 11am-5pm',
  sun_lunch: 'Sunday 11am-5pm',
  mon_dinner: 'Monday 5pm-9pm',
  tue_dinner: 'Tuesday 5pm-9pm',
  wed_dinner: 'Wednesday 5pm-9pm',
  thu_dinner: 'Thursday 5pm-9pm',
  fri_dinner: 'Friday 5pm-10pm',
  sat_dinner: 'Saturday 5pm-10pm',
  sun_dinner: 'Sunday 5pm-10pm',
}

// All shift keys in display order
export const ALL_SHIFTS: ShiftKey[] = [
  'mon_lunch', 'tue_lunch', 'wed_lunch', 'thu_lunch', 'fri_lunch', 'sat_lunch', 'sun_lunch',
  'mon_dinner', 'tue_dinner', 'wed_dinner', 'thu_dinner', 'fri_dinner', 'sat_dinner', 'sun_dinner',
]

export const LUNCH_SHIFTS: ShiftKey[] = [
  'mon_lunch', 'tue_lunch', 'wed_lunch', 'thu_lunch', 'fri_lunch', 'sat_lunch', 'sun_lunch',
]

export const DINNER_SHIFTS: ShiftKey[] = [
  'mon_dinner', 'tue_dinner', 'wed_dinner', 'thu_dinner', 'fri_dinner', 'sat_dinner', 'sun_dinner',
]
