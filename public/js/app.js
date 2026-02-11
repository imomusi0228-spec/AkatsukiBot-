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
                guild_id: '',
                tier: 'Pro',
                expiry_date: null,
                auto_renew: false
            },
            extendDuration: 1,
            extendUnit: 'm'
        });
        const addModal = reactive({
            show: false,
            data: { guild_id: '', user_id: '', tier: 'Pro', duration: '1m' }
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
                    (sub.guild_id || '').toLowerCase().includes(q) ||
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
                    loadData(true);
                } else if (localStorage.getItem('admin_token')) {
                    // Try token auth
                    isAdminLogged.value = true;
                    loadData(true);
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

        const loadData = async (isInitial = false) => {
            if (isInitial) loading.value = true;
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
            detailedStats.value = dsData || { tier_distribution: { paid: {}, trial: {}, overall: {} }, retention_rate: 0, growth_data: [] };
            if (isInitial) loading.value = false;
        };

        const formatDate = (dateStr) => {
            if (!dateStr) return '無期限';
            return new Date(dateStr).toLocaleDateString('ja-JP');
        };

        // Actions

        const toggleAutoRenew = async (sub) => {
            const newState = !sub.auto_renew;
            const gId = sub.guild_id;
            await api(`/subscriptions/${gId}/auto-renew`, 'PATCH', { enabled: newState });
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
            const gId = editModal.data.guild_id;
            await api(`/subscriptions/${gId}`, 'PUT', {
                action: 'extend',
                duration: editModal.extendDuration + editModal.extendUnit
            });
            bootstrap.Modal.getInstance(document.getElementById('editModal')).hide();
            loadData();
        };

        const updateTier = async () => {
            const gId = editModal.data.guild_id;
            await api(`/subscriptions/${gId}`, 'PUT', {
                action: 'update_tier',
                tier: editModal.data.tier
            });
            alert('プランを更新しました');
            loadData();
        }

        const createSub = async () => {
            if (!addModal.data.guild_id || !addModal.data.user_id) {
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

        const deactivateSub = async (sub) => {
            if (!confirm('ライセンスを無効化しますか？')) return;
            const gId = sub.guild_id;
            await api(`/subscriptions/${gId}`, 'DELETE');
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

        const showOverallPie = () => {
            const modal = new bootstrap.Modal(document.getElementById('pieModal'));
            modal.show();

            // Wait for modal to be visible
            setTimeout(() => {
                const ctx = document.getElementById('overallPieChart').getContext('2d');
                if (window.myPieChart) window.myPieChart.destroy();

                const data = detailedStats.value.tier_distribution.overall;
                window.myPieChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(data),
                        datasets: [{
                            data: Object.values(data),
                            backgroundColor: [
                                '#7aa2f7', '#e0af68', '#bb9af7', '#9ece6a', '#f7768e', '#565f89', '#414868'
                            ],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { color: '#c0caf5', padding: 20 }
                            }
                        }
                    }
                });
            }, 300);
        };

        return {
            user, isAdminLogged, loading, activeTab,
            stats, detailedStats, filteredSubscriptions, applications, logs,
            searchQuery, filterStatus,
            editModal, addModal, keyModal, appDetailsModal,
            formatDate, deactivateSub, toggleAutoRenew, copyText,
            openEditModal, saveEdit, updateTier, createSub,
            approveApp, deleteApp, openAppDetails, loginWithToken, logout,
            loadData, showOverallPie
        };
    }
}).mount('#app');

