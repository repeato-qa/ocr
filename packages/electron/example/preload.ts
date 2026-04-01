import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronOcr', {
  async detectInMain(imagePath: string) {
    return await ipcRenderer.invoke('ocr:detect-main', imagePath)
  },
  async loadAsset(name: string) {
    return await ipcRenderer.invoke('ocr:load-asset', name)
  },
  async loadImageDataUrl(imagePath: string) {
    return await ipcRenderer.invoke('ocr:load-image-data-url', imagePath)
  },
  async openImage() {
    return await ipcRenderer.invoke('ocr:open-image')
  },
})