const { createApp, ref, computed, onMounted, reactive } = Vue;

createApp({
    setup() {
        const user = ref(null);
        const isAdminLogged = ref(false);
        const loading = ref(true);
        const activeTab = ref('dashboard');

        // Data
        const stats = ref({
            active_count: 0,
            expiring_soon_count: 0,
            new_this_month: 0,
            renewed_this_month: 0
        });
        const subscriptions = ref([]);
        const applications = ref([]);
        const logs = ref([]);

        // Filters & Search
        const searchQuery = ref('');
        const filterStatus = ref('all'); // all, active, expired, expiring

        // Modal State
        const editModal = reactive({
            show: false,
            data: {
                server_id: '',
                plan_tier: 'Pro',
                expiry_date: null
            },
            extendDuration: 1
        });
        const addModal = reactive({
            show: false,
            data: { server_id: '', user_id: '', tier: 'Pro', duration: '1m' }
        });
        const keyModal = reactive({
            show: false,
            key: '',
            tier: ''
        });

        // Computed
        const filteredSubscriptions = computed(() => {
            let result = subscriptions.value;

            // Search
            if (searchQuery.value) {
                const q = searchQuery.value.toLowerCase();
                result = result.filter(sub =>
                    (sub.server_id || '').toLowerCase().includes(q) ||
                    (sub.user_display_name || '').toLowerCase().includes(q) ||
                    (sub.server_name || '').toLowerCase().includes(q)
                );
            }

            // Filter
            if (filterStatus.value === 'active') {
                result = result.filter(sub => sub.is_active);
            } else if (filterStatus.value === 'expired') {
                result = result.filter(sub => !sub.is_active);
            } else if (filterStatus.value === 'expiring') {
                const now = new Date();
                const sevenDays = new Date();
                sevenDays.setDate(now.getDate() + 7);
                result = result.filter(sub =>
                    sub.is_active &&
                    sub.expiry_date &&
                    new Date(sub.expiry_date) < sevenDays
                );
            }

            // Status Sort (Active First, then Expiry Date Asc)
            return result.sort((a, b) => {
                // if (a.is_active !== b.is_active) return b.is_active - a.is_active;
                // return new Date(a.expiry_date || 0) - new Date(b.expiry_date || 0);
                // Keep default sort from API (expiry ASC) but maybe handle it here?
                // Let's just use API sort primarily.
                return 0;
            });
        });

        // Methods
        const checkAuth = async () => {
            try {
                const res = await fetch('/api/auth/status');
                const data = await res.json();
                if (data.authenticated) {
                    user.value = data.user;
                    loadData();
                } else if (localStorage.getItem('admin_token')) {
                    // Try token auth
                    isAdminLogged.value = true;
                    loadData();
                } else {
                    loading.value = false;
                }
            } catch (e) {
                console.error(e);
                loading.value = false;
            }
        };

        const api = async (endpoint, method = 'GET', body = null) => {
            const headers = { 'Content-Type': 'application/json' };
            const token = localStorage.getItem('admin_token');
            if (token) headers['Authorization'] = token;

            const res = await fetch(`/api${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : null });
            if (res.status === 401 || res.status === 403) {
                if (res.status === 403) alert('権限がありません。');
                user.value = null;
                isAdminLogged.value = false;
                localStorage.removeItem('admin_token');
            }
            return res.json();
        };

        const loadData = async () => {
            loading.value = true;
            const [sData, aData, stData, lData] = await Promise.all([
                api('/subscriptions'),
                api('/applications'),
                api('/subscriptions/stats'),
                api('/subscriptions/logs')
            ]);
            subscriptions.value = sData || [];
            applications.value = aData || [];
            stats.value = stData || {};
            logs.value = lData || [];
            loading.value = false;
        };

        const formatDate = (dateStr) => {
            if (!dateStr) return '無期限';
            return new Date(dateStr).toLocaleDateString('ja-JP');
        };

        // Actions
        const extendSub = async (id, days) => {
            if (!confirm(`期間を ${days}日 延長しますか？`)) return;
            await api(`/subscriptions/${id}`, 'PUT', { action: 'extend', duration: `${days}d` });
            loadData();
        };

        const deactivateSub = async (id) => {
            if (!confirm('ライセンスを無効化しますか？')) return;
            await api(`/subscriptions/${id}`, 'DELETE');
            loadData();
        };

        const copyText = (text) => {
            navigator.clipboard.writeText(text);
            // toast?
        };

        // Modal Logic need to be connected to bootstap modal or custom
        // Since we are using Vue, let's just use simple v-if modals or integrate bootstrap js
        // For simplicity, let's use Bootstrap JS via direct DOM manipulation or wrapper
        // Actually, let's use global functions linked to window for simplicity with existing bootstrap if needed,
        // BUT we are rewriting. Let's make simple Vue custom modals to be dependency free from jQuery/BootstrapJS if possible,
        // but since we include Bootstrap CSS, we might as well use its JS.

        const openEditModal = (sub) => {
            editModal.data = { ...sub };
            editModal.extendDuration = 1;
            const modal = new bootstrap.Modal(document.getElementById('editModal'));
            modal.show();
        };

        const saveEdit = async () => {
            await api(`/subscriptions/${editModal.data.server_id}`, 'PUT', {
                action: 'extend',
                duration: editModal.extendDuration + 'm'
            });
            // Also update tier if changed? Split actions for simplicity
            // The implementation plan said: update tier too.
            const currentTier = editModal.data.plan_tier;
            // We can do another call if tier changed.
            // Ideally API supports both, but currently separated.
            bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
            loadData();
        };

        const updateTier = async () => {
            await api(`/subscriptions/${editModal.data.server_id}`, 'PUT', {
                action: 'update_tier',
                tier: editModal.data.plan_tier
            });
            alert('Tier updated');
            loadData();
        }

        const approveApp = async (app) => {
            if (!confirm('承認してキーを発行しますか？')) return;
            const res = await api(`/applications/${app.id}/approve`, 'POST');
            if (res.success) {
                keyModal.key = res.key;
                keyModal.tier = res.tier;
                new bootstrap.Modal(document.getElementById('keyModal')).show();
                loadData();
            }
        };

        const deleteApp = async (id) => {
            if (!confirm('削除しますか？')) return;
            await api(`/applications/${id}`, 'DELETE');
            loadData();
        };

        // Shortcuts
        const handleKeydown = (e) => {
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                document.getElementById('searchInput').focus();
            }
            if (e.key === 'Escape') {
                searchQuery.value = '';
            }
        };

        onMounted(() => {
            checkAuth();
            window.addEventListener('keydown', handleKeydown);
        });

        // Login Logic
        const loginWithToken = () => {
            const t = document.getElementById('tokenInput').value;
            localStorage.setItem('admin_token', t);
            checkAuth();
        };

        const logout = async () => {
            await api('/auth/logout', 'POST');
            user.value = null;
            localStorage.removeItem('admin_token');
            isAdminLogged.value = false;
        };

        return {
            user, isAdminLogged, loading, activeTab,
            stats, filteredSubscriptions, applications, logs,
            searchQuery, filterStatus,
            editModal, addModal, keyModal,
            formatDate, extendSub, deactivateSub, copyText,
            openEditModal, saveEdit, updateTier,
            approveApp, deleteApp, loginWithToken, logout,
            loadData
        };
    }
}).mount('#app');
