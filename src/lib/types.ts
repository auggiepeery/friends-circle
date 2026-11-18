export type Profile = {
  id: string;
  email: string;
  display_name: string;
  availability_hint: string;
};

export type Plan = {
  id: string;
  share_token: string;
  creator_id: string;
  circle_id?: string | null;
  title: string;
  description: string;
  place: string;
  starts_at: string | null;
  ends_at: string | null;
  template: string;
  outdoor: boolean;
  lat: number | null;
  lon: number | null;
  reminder_at: string | null;
  recurring_rule: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Rsvp = {
  plan_id: string;
  user_id: string;
  response: string;
  display_name?: string;
};

export type Comment = {
  id: string;
  plan_id: string;
  user_id: string;
  body: string;
  created_at: string;
  display_name?: string;
};

export type PollOption = {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
  votes: number;
  voted: boolean;
};

export type Poll = {
  id: string;
  plan_id: string;
  kind: string;
  question: string;
  options: PollOption[];
};

export type Expense = {
  id: string;
  plan_id: string;
  payer_id: string;
  description: string;
  amount_cents: number;
  display_name?: string;
};

export type Notification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  created_at: string;
};

export type Friendship = {
  id: string;
  user_id: string;
  friend_id: string;
  status: string;
  display_name?: string;
  email?: string;
  availability_hint?: string;
};
