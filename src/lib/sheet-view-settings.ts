export type SheetViewSettings = {
  showRowHeaders: boolean
  showColHeaders: boolean
  showVerticalGridlines: boolean
  showHorizontalGridlines: boolean
  showTabStrip: boolean
  showScrollbars: boolean
  zoom: number
  freezeRow: number | null
  freezeCol: number | null
}

export const DEFAULT_SHEET_VIEW_SETTINGS: SheetViewSettings = {
  showRowHeaders: true,
  showColHeaders: true,
  showVerticalGridlines: true,
  showHorizontalGridlines: true,
  showTabStrip: true,
  showScrollbars: true,
  zoom: 100,
  freezeRow: null,
  freezeCol: null,
}

