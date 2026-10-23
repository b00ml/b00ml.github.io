import { defineStore } from 'pinia'

export const useConnectionStore = defineStore('connection', () => {
  // Source components use this flag to show the workbench, never to open a connection.
  return { connected: true }
})
