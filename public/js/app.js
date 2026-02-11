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
        const detailedStats = ref({
            tier_distribution: {},
            retention_rate: 0,
            growth_data: []
        });

        // Filters & Search
        const searchQuery = ref('');
        const filterStatus = ref('all'); // all, active, expired, expiring

        // Modal State
        const editModal = reactive({
            show: false,
            data: {
                server_id: '',
                plan_tier: 'Pro',
                expiry_date: null,
                auto_renew: false
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
        const appDetailsModal = reactive({
            data: {}
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

            return result;
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
            const [sData, aData, stData, lData, dsData] = await Promise.all([
                api('/subscriptions'),
                api('/applications'),
                api('/subscriptions/stats'),
                api('/subscriptions/logs'),
                api('/subscriptions/stats/detailed')
            ]);
            subscriptions.value = sData || [];
            applications.value = aData || [];
            stats.value = stData || {};
            logs.value = lData || [];
            detailedStats.value = dsData || { tier_distribution: {}, retention_rate: 0, growth_data: [] };
            loading.value = false;
        };

        const formatDate = (dateStr) => {
            if (!dateStr) return '無期限';
            return new Date(dateStr).toLocaleDateString('ja-JP');
        };

        // Actions
        const deactivateSub = async (id) => {
            if (!confirm('ライセンスを無効化しますか？')) return;
            await api(`/subscriptions/${id}`, 'DELETE');
            loadData();
        };

        const toggleAutoRenew = async (sub) => {
            const newState = !sub.auto_renew;
            await api(`/subscriptions/${sub.server_id}/auto-renew`, 'PATCH', { enabled: newState });
            sub.auto_renew = newState;
        };

        const copyText = (text) => {
            navigator.clipboard.writeText(text);
        };

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
            bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
            loadData();
        };

        const updateTier = async () => {
            await api(`/subscriptions/${editModal.data.server_id}`, 'PUT', {
                action: 'update_tier',
                tier: editModal.data.plan_tier
            });
            alert('プランを更新しました');
            loadData();
        }

        const createSub = async () => {
            if (!addModal.data.server_id || !addModal.data.user_id) {
                alert('サーバーIDとユーザーIDは必須やな');
                return;
            }
            await api('/subscriptions', 'POST', addModal.data);
            bootstrap.Modal.getInstance(document.getElementById('addModal')).hide();
            loadData();
        };

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

        const openAppDetails = (app) => {
            appDetailsModal.data = app;
            new bootstrap.Modal(document.getElementById('appDetailsModal')).show();
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
            stats, detailedStats, filteredSubscriptions, applications, logs,
            searchQuery, filterStatus,
            editModal, addModal, keyModal, appDetailsModal,
            formatDate, extendSub, deactivateSub, toggleAutoRenew, copyText,
            openEditModal, saveEdit, updateTier, createSub,
            approveApp, deleteApp, openAppDetails, loginWithToken, logout,
            loadData
        };
    }
}).mount('#app');

