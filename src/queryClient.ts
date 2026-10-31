import { QueryClient } from '@tanstack/react-query';

// Общий QueryClient react-admin (передаётся в <Admin queryClient>). Вынесен в модуль, чтобы
// OrgProvider — он живёт выше <Admin> и не видит QueryClientProvider — мог сбросить кэш
// canAccess при смене организации: ключ ['auth','canAccess',{action,resource,recordId}]
// организацию не учитывает, а useRequireAccess уводит на /access-denied по закэшированному
// false (access_profiles). Настройки — по умолчанию, как у react-admin без своего клиента.
export const queryClient = new QueryClient();
