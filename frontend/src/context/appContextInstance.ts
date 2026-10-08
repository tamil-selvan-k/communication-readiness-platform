import { createContext } from 'react';
import type { AppContextType } from './AppContext';

// Lives in its own module so the context object keeps its identity when
// AppContext.tsx is hot-reloaded. Otherwise the running <AppProvider> and the
// re-imported useApp() end up on different context objects and every consumer
// throws "useApp must be used within an AppProvider" until a full page reload.
export const AppContext = createContext<AppContextType | undefined>(undefined);
