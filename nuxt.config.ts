// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@vueuse/nuxt'],
  
  devtools: { enabled: true },
  
  ssr: true, // MetaPeek practices what it preaches
  
  typescript: {
    strict: true,
    shim: false
  },
  
  app: {
    head: {
      title: 'MetaPeek — Meta Tag & Open Graph Previewer',
      meta: [
        { name: 'description', content: 'Inspect, preview, and fix HTML meta tags and Open Graph markup. Fast, clean, and actionable.' },
        { property: 'og:title', content: 'MetaPeek — Meta Tag & Open Graph Previewer' },
        { property: 'og:description', content: 'Inspect, preview, and fix HTML meta tags and Open Graph markup.' },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: 'https://metapeek.icjia.app' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  }
})
