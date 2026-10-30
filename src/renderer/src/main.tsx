import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { initApi, outputIdFromUrl } from './api/client'
import { App } from './App'
import { OutputApp } from './output/OutputApp'

async function boot(): Promise<void> {
  const root = document.getElementById('root')
  if (!root) return
  await initApi()
  const outputId = outputIdFromUrl()
  createRoot(root).render(<StrictMode>{outputId ? <OutputApp outputId={outputId} /> : <App />}</StrictMode>)
}

void boot()
