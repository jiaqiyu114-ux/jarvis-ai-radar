/**
 * Provider registry.
 *
 * Add new ProviderAdapters here as they are implemented.
 * Import from this file when you need to iterate over all providers.
 */

export { MockProviderAdapter }  from './mock-provider'
export { RssProviderAdapter }   from './rss-provider'

// Future adapters (uncomment when implemented):
// export { AihotProviderAdapter }  from './aihot-provider'
