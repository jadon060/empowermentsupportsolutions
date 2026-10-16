/* Public publishable configuration only. Authorization is enforced by Supabase RLS. */
(function () {
  'use strict';
  const url='https://bqanjupmcgydvmfgvutx.supabase.co';
  const key='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxYW5qdXBtY2d5ZHZtZmd2dXR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MTI4NzQsImV4cCI6MjA3NjM4ODg3NH0.J3A12rwUlSqjIsmlnNCcwis6Qt_ryw7ZzFqLftuMKUk';
  window.ESSAdminSession={email:'empowermentess@gmail.com',client:window.supabase?.createClient(url,key,{auth:{storageKey:'ess-admin-pin-session-v2',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}),loginUrl:'/login.html?admin=1&next='+encodeURIComponent('/portal/admin.html')};
})();
