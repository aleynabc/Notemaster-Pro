export interface Note {
  id: string;
  customerName: string;
  dateTime: string;
  concept: string;
  materials: string;
  todo: string;
  price: string;
  location?: string;
  notes: string;
  color: string;
  createdAt: number;
  isStarred?: boolean;
  starredAt?: number;
  isPaid?: boolean;
  paidAt?: number;
}

export interface AppSettings {
  highContrast: boolean;
  notificationsEnabled: boolean;
}
