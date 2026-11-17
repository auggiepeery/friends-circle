import type { AppData } from './types'

const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 60 * 60 * 1000).toISOString()

export const FRIEND_COLORS = [
  '#E07A5F',
  '#3D7A6A',
  '#D4A017',
  '#5B6C8F',
  '#C45C84',
  '#6B8F71',
  '#B85C38',
  '#4A7C8C',
] as const

export const SAMPLE_EMOJIS = [
  '🌊',
  '🎷',
  '📚',
  '☕',
  '🌿',
  '🎬',
  '🚲',
  '🍳',
  '🎸',
  '✈️',
]

export function createSeedData(): AppData {
  const friends = [
    {
      id: 'f-maya',
      name: 'Maya Chen',
      note: 'Always halfway to somewhere interesting',
      emoji: '🌊',
      color: '#3D7A6A',
      createdAt: hoursAgo(720),
    },
    {
      id: 'f-jordan',
      name: 'Jordan Blake',
      note: 'Jazz nights & late kitchens',
      emoji: '🎷',
      color: '#E07A5F',
      createdAt: hoursAgo(600),
    },
    {
      id: 'f-sam',
      name: 'Sam Okonkwo',
      note: 'Reads faster than I text',
      emoji: '📚',
      color: '#5B6C8F',
      createdAt: hoursAgo(480),
    },
    {
      id: 'f-rio',
      name: 'Rio Alvarez',
      note: 'Garden person. Brings herbs.',
      emoji: '🌿',
      color: '#6B8F71',
      createdAt: hoursAgo(360),
    },
  ]

  const activities = [
    {
      id: 'a1',
      friendId: 'f-maya',
      what: 'Morning swim at the bay',
      place: 'Crissy Field',
      whenLabel: 'sunrise',
      timestamp: hoursAgo(2),
    },
    {
      id: 'a2',
      friendId: 'f-jordan',
      what: 'Sitting in on a trio set',
      place: 'The Chapel',
      whenLabel: 'tonight',
      timestamp: hoursAgo(5),
    },
    {
      id: 'a3',
      friendId: 'f-sam',
      what: 'Finishing a library haul',
      place: 'Main branch',
      timestamp: hoursAgo(8),
    },
    {
      id: 'a4',
      friendId: 'f-rio',
      what: 'Repotting the monstera',
      place: 'home balcony',
      whenLabel: 'afternoon',
      timestamp: hoursAgo(12),
    },
    {
      id: 'a5',
      friendId: 'f-maya',
      what: 'Sketching boats at the pier',
      place: 'Fisherman’s Wharf',
      timestamp: hoursAgo(28),
    },
    {
      id: 'a6',
      friendId: 'f-jordan',
      what: 'Testing a new hot sauce batch',
      place: 'kitchen',
      whenLabel: 'late',
      timestamp: hoursAgo(36),
    },
    {
      id: 'a7',
      friendId: 'f-sam',
      what: 'Office hours for the book club',
      place: 'cafe on 16th',
      timestamp: hoursAgo(50),
    },
    {
      id: 'a8',
      friendId: 'f-rio',
      what: 'Farmers market run',
      place: 'Ferry Plaza',
      whenLabel: 'Saturday',
      timestamp: hoursAgo(72),
    },
  ]

  const routines = [
    {
      id: 'r-maya-tennis',
      friendId: 'f-maya',
      what: 'Tennis class',
      place: 'Golden Gate Park courts',
      whenLabel: 'after work',
      recurrence: 'weekly' as const,
      weekdays: [2, 4] as (2 | 4)[],
      time: '18:30',
      createdAt: hoursAgo(720),
    },
    {
      id: 'r-sam-run',
      friendId: 'f-sam',
      what: 'Morning run club',
      place: 'Panhandle',
      recurrence: 'weekly' as const,
      weekdays: [1, 3, 5] as (1 | 3 | 5)[],
      time: '07:00',
      createdAt: hoursAgo(480),
    },
  ]

  return { version: 1, friends, activities, routines }
}
