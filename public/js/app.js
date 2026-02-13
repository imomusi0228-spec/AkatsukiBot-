const { createApp, ref, computed, onMounted, reactive, watch } = Vue;

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
        const subPagination = ref({ total: 0, page: 1, pages: 1, limit: 50 });
        const appPagination = ref({ total: 0, page: 1, pages: 1, limit: 50 });
        const auditLogs = ref([]);
        const logPagination = ref({ total: 0, page: 1, pages: 1, limit: 50 });
        const logFilter = reactive({ search: '', action: '' });
        const settings = ref({ webhook_url: '' });
        const selectedSubs = ref([]);
        const detailedStats = ref({
            tier_distribution: { paid: {}, trial: {}, overall: {} },
            retention_rate: 0,
            growth_data: []
        });
        // Filters & Search
        const searchQuery = ref('');
        const filterStatus = ref('all'); // all, active, expired, expiring

        // Modal State
        // ... (remaining modal state) ...

        // Computed
        // We now mostly rely on server-side filtering, but we keep this for reactive UI if needed
        const filteredSubscriptions = computed(() => {
            return subscriptions.value;
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

            // Build query params for subscriptions
            let subQuery = `?page=${subPagination.value.page}&limit=${subPagination.value.limit}`;
            if (searchQuery.value) subQuery += `&search=${encodeURIComponent(searchQuery.value)}`;
            // Filter mapping: active, expired -> we actually handle it via search in SQL ILIKE for now, 
            // but for full scalability, we'd add &status= filter to API.
            // For now, let's just use the search param.

            const [sRes, aRes, stData, setsRes, dsData] = await Promise.all([
                api(`/subscriptions${subQuery}`),
                api(`/applications?page=${appPagination.value.page}&limit=${appPagination.value.limit}`),
                api('/subscriptions/stats'),
                api('/settings'),
                api('/subscriptions/stats/detailed')
            ]);

            subscriptions.value = sRes.data || [];
            subPagination.value = sRes.pagination || subPagination.value;

            applications.value = aRes.data || [];
            appPagination.value = aRes.pagination || appPagination.value;

            stats.value = stData || {};
            // Merge properties to avoid losing webhook_url if it's missing from API
            if (setsRes) {
                Object.assign(settings.value, setsRes);
            }
            detailedStats.value = dsData || { tier_distribution: { paid: {}, trial: {}, overall: {} }, retention_rate: 0, growth_data: [] };

            if (isInitial) loading.value = false;
        };

        const loadLogs = async (page = 1) => {
            logPagination.value.page = page;
            let query = `?page=${page}&limit=${logPagination.value.limit}`;
            if (logFilter.search) query += `&search=${encodeURIComponent(logFilter.search)}`;
            if (logFilter.action) query += `&action_type=${logFilter.action}`;

            const res = await api(`/logs${query}`);
            auditLogs.value = res.logs || [];
            logPagination.value = res.pagination || logPagination.value;
        };

        const updateSetting = async (key, value) => {
            await api('/settings', 'POST', { key, value });
            alert('設定を保存しました');
        };

        const testWebhook = async () => {
            try {
                const res = await api('/settings/test-webhook', 'POST');
                if (res.success) {
                    alert('テスト送信をリクエストしました。Discordを確認してみてください。');
                } else if (res.error) {
                    alert('送信失敗: ' + res.error);
                } else {
                    alert('送信に失敗した可能性があります。WebhookURLが正しいか確認してください。');
                }
            } catch (e) {
                alert('エラーが発生しました: ' + e.message);
            }
        };

        const toggleSelectAll = (e) => {
            if (e.target.checked) {
                selectedSubs.value = subscriptions.value.map(s => s.guild_id);
            } else {
                selectedSubs.value = [];
            }
        };

        const bulkDeactivate = async () => {
            if (!confirm(`${selectedSubs.value.length}件のライセンスを一括停止しますか？`)) return;
            loading.value = true;
            try {
                // For simplicity, we process them one by one or in a loop
                // In a production app, we'd have a specific /bulk endpoint
                for (const gId of selectedSubs.value) {
                    await api(`/subscriptions/${gId}`, 'DELETE');
                }
                alert('一括停止が完了しました');
                selectedSubs.value = [];
                loadData();
            } catch (e) {
                alert('一括処理中にエラーが発生しました');
            } finally {
                loading.value = false;
            }
        };

        const changePage = (type, page) => {
            if (type === 'sub') {
                subPagination.value.page = page;
            } else {
                appPagination.value.page = page;
            }
            loadData();
        };

        const search = () => {
            subPagination.value.page = 1;
            loadData();
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

        const updateMilestone = async () => {
            const gId = editModal.data.guild_id;
            const res = await api(`/subscriptions/${gId}/milestone`, 'PATCH', {
                current_milestone: parseInt(editModal.data.current_milestone),
                auto_unlock_enabled: editModal.data.auto_unlock_enabled
            });
            if (res.success) {
                // Keep local state or reload
                loadData();
            } else {
                alert('マイルストーンの更新に失敗しました: ' + (res.error || 'Unknown error'));
            }
        };

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
            if (!confirm('ライセンスを無効化（停止）しますか？')) return;
            const gId = sub.guild_id;
            await api(`/subscriptions/${gId}`, 'DELETE');
            loadData();
        };

        const resumeSub = async (sub) => {
            if (!confirm('ライセンスを再開しますか？')) return;
            const gId = sub.guild_id;
            await api(`/subscriptions/${gId}`, 'PUT', {
                action: 'toggle_active',
                is_active: true
            });
            loadData();
        };

        const hardDeleteSub = async (sub) => {
            if (!confirm('ライセンス情報を「完全に削除」しますか？\nこの操作は取り消せません。')) return;
            const gId = sub.guild_id;
            await api(`/subscriptions/${gId}/delete`, 'DELETE');
            loadData();
        };

        const openAppDetails = (app) => {
            appDetailsModal.data = app;
            new bootstrap.Modal(document.getElementById('appDetailsModal')).show();
        };

        const sendAnnouncement = async () => {
            if (!announceModal.title || !announceModal.content) {
                alert('タイトルと内容は必須やな');
                return;
            }
            announceModal.sending = true;
            try {
                const res = await api('/announce', 'POST', {
                    title: announceModal.title,
                    content: announceModal.content,
                    type: announceModal.type,
                    scheduled_at: announceModal.scheduled_at,
                    associated_tasks: announceModal.associated_tasks
                });
                if (res.success) {
                    alert('告知を送信/予約したで！');
                    announceModal.title = '';
                    announceModal.content = '';
                    announceModal.type = 'normal';
                    announceModal.scheduled_at = '';
                    announceModal.associated_tasks = [];
                    loadAnnouncements();
                    activeTab.value = 'dashboard';
                } else {
                    alert('エラー: ' + (res.error || '不明なエラー'));
                }
            } finally {
                announceModal.sending = false;
            }
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

        watch(activeTab, (newTab) => {
            if (newTab === 'stats') {
                setTimeout(initGrowthChart, 300);
            }
        });

        const initGrowthChart = () => {
            const ctx = document.getElementById('growthChart')?.getContext('2d');
            if (!ctx) return;
            if (window.myGrowthChart) window.myGrowthChart.destroy();

            const data = detailedStats.value.growth_data;
            window.myGrowthChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.map(i => i.month),
                    datasets: [{
                        label: '新規契約数',
                        data: data.map(i => i.count),
                        borderColor: '#7aa2f7',
                        backgroundColor: 'rgba(122, 162, 247, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' } },
                        x: { grid: { display: false } }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
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

        // Modal States (Restored)
        const editModal = reactive({
            show: false,
            data: { guild_id: '', tier: 'Pro', expiry_date: null, auto_renew: false, current_milestone: 1, auto_unlock_enabled: false },
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
        const announceModal = reactive({
            title: '',
            content: '',
            type: 'normal',
            scheduled_at: '',
            associated_tasks: [],
            sending: false
        });
        const announcements = ref([]);
        const editAnnounceModal = reactive({
            data: { id: null, title: '', content: '', type: 'normal', scheduled_at: '', associated_tasks: [] }
        });

        const loadAnnouncements = async () => {
            const res = await api('/announce', 'GET');
            if (res) announcements.value = res;
        };

        const deleteAnnouncement = async (id) => {
            if (!confirm('この告知を削除（キャンセル）しますか？')) return;
            const res = await api(`/announce/${id}`, 'DELETE');
            if (res.success) {
                alert('削除しました');
                loadAnnouncements();
            }
        };

        const openEditAnnounceModal = (ann) => {
            editAnnounceModal.data = { ...ann, associated_tasks: ann.associated_tasks || [] };
            if (ann.scheduled_at) {
                const d = new Date(ann.scheduled_at);
                const offset = d.getTimezoneOffset() * 60000;
                const localISOTime = (new Date(d - offset)).toISOString().slice(0, 16);
                editAnnounceModal.data.scheduled_at = localISOTime;
            }
            if (!editAnnounceModal.instance) {
                editAnnounceModal.instance = new bootstrap.Modal(document.getElementById('editAnnounceModal'));
            }
            editAnnounceModal.instance.show();
        };

        const saveAnnounceEdit = async () => {
            const res = await api(`/announce/${editAnnounceModal.data.id}`, 'PUT', editAnnounceModal.data);
            if (res.success) {
                alert('更新しました');
                editAnnounceModal.instance.hide();
                loadAnnouncements();
            } else {
                alert('エラー: ' + res.error);
            }
        };

        // ... methods (formatDate, toggleAutoRenew, etc.) ...

        return {
            user, isAdminLogged, loading, activeTab,
            stats, detailedStats, filteredSubscriptions, subscriptions, applications, auditLogs,
            subPagination, appPagination, logPagination, logFilter,
            searchQuery, filterStatus, settings, selectedSubs,
            editModal, addModal, keyModal, appDetailsModal,
            formatDate, deactivateSub, resumeSub, hardDeleteSub, toggleAutoRenew, copyText,
            openEditModal, saveEdit, updateTier, createSub, updateMilestone,
            approveApp, deleteApp, openAppDetails, loginWithToken, logout,
            loadData, changePage, search, showOverallPie,
            announceModal, sendAnnouncement, loadLogs, updateSetting, testWebhook,
            toggleSelectAll, bulkDeactivate,
            announcements, deleteAnnouncement, openEditAnnounceModal, editAnnounceModal, saveAnnounceEdit
        };
    }
}).mount('#app');

