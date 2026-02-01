// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@vueuse/nuxt'],
  
  css: ['~/assets/css/main.css'],
  
  devtools: { enabled: true },
  
  ssr: true,
  
  typescript: {
    strict: true,
    shim: false
  },

  colorMode: {
    preference: 'dark', // Default to dark mode
    fallback: 'dark'
  },
  
  app: {
    head: {
      title: 'MetaPeek',
      meta: [
        { name: 'description', content: 'Inspect, preview, and fix HTML meta tags and Open Graph markup.' },
        { property: 'og:title', content: 'MetaPeek' },
        { property: 'og:description', content: 'Inspect, preview, and fix HTML meta tags and Open Graph markup.' },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: 'https://metapeek.icjia.app' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' }
      ]
    }
  }
})
