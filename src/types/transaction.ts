export interface TransactionHistoryRow {
  id: string;
  user_id: string;
  user_name?: string; // For admin view
  course_id: string;
  course_title: string;
  course_slug: string;
  course_thumbnail_url?: string;
  final_price: number;
  discount_applied: number;
  coupon_code?: string;
  payment_method_name?: string;
  payment_submitted_at: string;
  created_at: string;
  payment_receipt_url?: string;
  payment_notes?: string;
  access_duration_days: number;
  access_expires_at?: string;
}
