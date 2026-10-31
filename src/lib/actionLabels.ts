export const actionLabels = {
  edit: "Edit",
  void: "Void",
  restore: "Restore",
  delete: "Delete",
  archive: "Archive",
  unarchive: "Restore",
  more: "More actions",
  view: "View",
  addTransaction: "Add transaction",
  copy: "Copy",
} as const;

export type ActionId = keyof typeof actionLabels;
