/** Types matching easytill2 close / evidence exporters (subset). */

export type CloseDaily = {
  close_date: string;
  total_revenue: number;
  cash_total: number;
  qr_total: number;
  tx_count: number;
  total_items: number;
};

export type CloseTxItem = {
  name_snapshot: string;
  qty: number;
  price_snapshot: number;
};

export type CloseTransaction = {
  id: number;
  created_at: string;
  payment_method: string;
  total: number;
  cash_given?: number | null;
  change_returned?: number | null;
  items: CloseTxItem[];
};

export type CloseProduct = {
  id: number;
  name?: string;
  subtype?: string | null;
  form?: string | null;
  package_size?: string | null;
  lot_number?: string | null;
  supplier_id?: number | null;
};

export type CloseSupplier = {
  id: number;
  name?: string;
  address?: string;
  ic?: string;
  country?: string;
};

export type CloseStockMovement = {
  id?: number;
  product_id: number;
  product_name?: string;
  delta: number;
  kind?: string;
  created_at?: string;
  transaction_id?: number | null;
  /** Číslo dodacího listu / dokladu zadané při příjmu (1:1 z POS). */
  document_number?: string | null;
  batch_number?: string | null;
  batch_document?: string | null;
  batch_doc_number?: string | null;
  stock_after?: number | null;
  supplier_name?: string | null;
  supplier_address?: string | null;
  supplier_ic?: string | null;
  supplier_country?: string | null;
  user_name?: string | null;
};

export type CloseExportSettings = {
  shop_location?: string;
  shop_address?: string;
  ico?: string;
  receipt_prefix?: string;
  supplier_country?: string;
};

export type CloseExportSource = {
  close: CloseDaily;
  transactions: CloseTransaction[];
  dayMovements: CloseStockMovement[];
  products: CloseProduct[];
  suppliers: CloseSupplier[];
  settings: CloseExportSettings;
};

export type ProductDaySummary = {
  productId: number;
  name: string;
  label: string;
  subtype: string;
  form: string;
  packageSize: string;
  lot: string;
  supplier: string;
  prijato: number;
  vydano: number;
  stavZasob: string;
  moveCount: number;
};
