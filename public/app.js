const state = {
  token: null,
  user: null,
  types: [],
  brands: [],
  nvrs: [],
  devices: [],
  users: [],
  records: [],
  deviceSearch: '',
  devicePageSize: 10,
  devicePageIndex: 1,
  deviceSelected: new Set(),
  deviceSortField: null,
  deviceSortDirection: 'asc',
  dashboardSubnet: ''
};

const endpoints = {
  login: '/api/login',
  verify: '/api/verify',
  deviceTypes: '/api/device-types',
  brands: '/api/brands',
  nvrs: '/api/nvrs',
  devices: '/api/devices',
  users: '/api/users',
  records: '/api/maintenance-records',
  loginLogs: '/api/login-logs',
  loginBackground: '/api/login-background',
  siteLogo: '/api/site-logo',
  settings: '/api/settings',
  backup: '/api/backup',
  restore: '/api/restore',
  importDevices: '/api/import-devices',
  exportDevices: '/api/export-devices',
  batchDeleteDevices: '/api/devices/batch-delete',
  template: '/api/template/devices'
};

const menuItems = [
  { id: 'dashboard', title: '首页' },
  { id: 'devices', title: '设备列表' },
  { id: 'types', title: '类型与品牌' },
  { id: 'nvrs', title: '录像机维护' },
  { id: 'users', title: '维修人员' },
  { id: 'records', title: '维修记录' },
  { id: 'logs', title: '系统日志', adminOnly: true },
  { id: 'settings', title: '系统设置', adminOnly: true }
];

const DEFAULT_LOGO_URL = '/default-logo.svg';

const permissionLabels = {
  view_devices: '查看设备',
  manage_devices: '管理设备',
  view_types: '查看类型',
  manage_types: '管理类型',
  view_nvrs: '查看录像机',
  manage_nvrs: '管理录像机',
  view_records: '查看维修记录',
  manage_records: '管理维修记录',
  manage_users: '管理账号',
  import_devices: '导入设备',
  export_devices: '导出设备'
};

function getPermissionLabel(key) {
  return permissionLabels[key] || key;
}

const mainPanel = document.getElementById('main-panel');
const menuEl = document.getElementById('menu');
const pageTitle = document.getElementById('page-title');
const logoutBtn = document.getElementById('logout-btn');
const userWidget = document.getElementById('user-widget');

// 初始化登录页面事件监听器
function initLoginPage() {
  const loginSubmitBtn = document.getElementById('login-submit');
  if (loginSubmitBtn) {
    loginSubmitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      login();
    });
  }

  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');

  const handleEnterKey = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      login();
    }
  };

  if (usernameInput) {
    usernameInput.addEventListener('keypress', handleEnterKey);
  }
  if (passwordInput) {
    passwordInput.addEventListener('keypress', handleEnterKey);
  }
}

// 页面加载时初始化登录页面事件
initLoginPage();

function sendRequest(url, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['x-access-token'] = state.token;
  return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) throw new Error(data.message || '请求失败');
      return data;
    });
}

function setPageTitle(text) {
  pageTitle.textContent = text;
}

function renderMenu() {
  menuEl.innerHTML = '';
  menuItems.forEach((item) => {
    // 如果是adminOnly菜单项，只有主账号才能看见
    if (item.adminOnly && (!state.user || !state.user.is_admin)) return;
    const link = document.createElement('a');
    link.href = '#';
    link.className = 'menu-item';
    link.textContent = item.title;
    link.dataset.page = item.id;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      gotoPage(item.id);
    });
    menuEl.appendChild(link);
  });
}

function showUser() {
  if (!state.user) {
    userWidget.innerHTML = '<strong>请先登录</strong><span>掌握全部设备资产</span>';
    return;
  }
  const name = state.user.display_name || state.user.username;
  userWidget.innerHTML = `<strong>${name}</strong><span>${state.user.is_admin ? '主账号管理员' : '分账号用户'}</span>`;
}

function applySiteLogo(url) {
  const logoUrl = url || DEFAULT_LOGO_URL;
  const sidebarLogo = document.getElementById('sidebar-logo');
  const loginLogo = document.getElementById('login-logo');
  if (sidebarLogo) sidebarLogo.src = logoUrl;
  if (loginLogo) loginLogo.src = logoUrl;
}

function loadSiteLogo() {
  return fetch(endpoints.siteLogo)
    .then((res) => res.json())
    .then((data) => {
      if (data.success) applySiteLogo(data.site_logo_url);
    })
    .catch((error) => {
      console.error('获取 Logo 失败:', error);
      applySiteLogo(null);
    });
}

function showLogin() {
  setPageTitle('登录');
  logoutBtn.hidden = true;
  // 隐藏主应用界面，显示登录页面
  document.getElementById('app-shell').hidden = true;
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-page').hidden = false;
  document.getElementById('login-page').style.display = 'flex';

  // 应用自定义登录背景
  const loginPage = document.getElementById('login-page');
  if (loginPage) {
    // 重置为默认背景
    loginPage.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

    // 从服务器获取主账号的登录背景配置（全局生效）
    fetch(endpoints.loginBackground)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.login_background_url) {
          loginPage.style.background = `url(${data.login_background_url}) center/cover no-repeat`;
        }
      })
      .catch((error) => {
        console.error('获取登录背景失败:', error);
      });
  }

  loadSiteLogo();
}

function restoreSession() {
  const savedToken = localStorage.getItem('it_ledger_token');
  const savedUser = localStorage.getItem('it_ledger_user');
  if (!savedToken || !savedUser) return Promise.reject();
  state.token = savedToken;
  state.user = JSON.parse(savedUser);
  return sendRequest(endpoints.verify)
    .then((data) => {
      state.user = data.user;
      localStorage.setItem('it_ledger_user', JSON.stringify(state.user));
      showUser();
      logoutBtn.hidden = false;
      renderMenu();
      // 显示主应用界面，隐藏登录页面
      const appShell = document.getElementById('app-shell');
      const loginPage = document.getElementById('login-page');
      if (appShell) {
        appShell.hidden = false;
        appShell.style.display = 'grid';
      }
      if (loginPage) {
        loginPage.hidden = true;
        loginPage.style.display = 'none';
      }
      return loadAllData();
    })
    .catch(() => {
      logout();
      return Promise.reject();
    });
}

function gotoPage(page) {
  if (!state.user) return showLogin();
  // 保存当前页面到localStorage
  localStorage.setItem('it_ledger_current_page', page);
  document.querySelectorAll('.menu-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  updateTabBarActive(page);
  switch (page) {
    case 'dashboard': return renderDashboard();
    case 'devices': return renderDevices();
    case 'types': return renderTypes();
    case 'nvrs': return renderNvrs();
    case 'users': return renderUsers();
    case 'records': return renderRecords();
    case 'logs': return renderLogs();
    case 'settings': return renderSettings();
    default: return renderDashboard();
  }
}

function loadAllData() {
  return Promise.all([
    sendRequest(endpoints.deviceTypes).then((data) => state.types = data.types),
    sendRequest(endpoints.brands).then((data) => state.brands = data.brands),
    sendRequest(endpoints.nvrs).then((data) => state.nvrs = data.nvrs),
    sendRequest(endpoints.devices).then((data) => state.devices = data.devices),
    sendRequest(endpoints.users).then((data) => state.users = data.users),
    sendRequest(endpoints.records).then((data) => state.records = data.records)
  ]).catch(() => {});
}

function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) return alert('请输入账号和密码');
  fetch(endpoints.login, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) return alert(data.message || '登录失败');
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('it_ledger_token', state.token);
      localStorage.setItem('it_ledger_user', JSON.stringify(state.user));
      showUser();
      logoutBtn.hidden = false;
      renderMenu();
      // 显示主应用界面，隐藏登录页面
      const appShell = document.getElementById('app-shell');
      const loginPage = document.getElementById('login-page');
      if (appShell) {
        appShell.hidden = false;
        appShell.style.display = 'grid';
      }
      if (loginPage) {
        loginPage.hidden = true;
        loginPage.style.display = 'none';
      }
      loadAllData().then(() => {
        renderMobileMorePopup();
        gotoPage('dashboard');
      });
    })
    .catch((error) => alert(error.message));
}

function logout() {
  state.token = null;
  state.user = null;
  state.types = [];
  state.brands = [];
  state.nvrs = [];
  state.devices = [];
  state.users = [];
  state.records = [];
  state.deviceSearch = '';
  state.devicePageSize = 10;
  state.devicePageIndex = 1;
  state.deviceSelected = new Set();
  localStorage.removeItem('it_ledger_token');
  // 不清除用户信息，保留登录背景设置
  // localStorage.removeItem('it_ledger_user');

  // 隐藏主应用界面，显示登录页面
  const appShell = document.getElementById('app-shell');
  const loginPage = document.getElementById('login-page');
  if (appShell) {
    appShell.hidden = true;
    appShell.style.display = 'none';
  }
  if (loginPage) {
    loginPage.hidden = false;
    loginPage.style.display = 'flex';
  }

  showLogin();
}

function renderDashboard() {
  setPageTitle('首页');
  logoutBtn.hidden = false;
  mainPanel.innerHTML = `
    <div class="dashboard">
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-icon stat-devices"></div>
          <div class="stat-info">
            <span class="stat-value">${state.devices.length}</span>
            <span class="stat-label">总设备数</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-nvrs"></div>
          <div class="stat-info">
            <span class="stat-value">${state.nvrs.length}</span>
            <span class="stat-label">录像机</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-brands"></div>
          <div class="stat-info">
            <span class="stat-value">${state.brands.length}</span>
            <span class="stat-label">品牌数</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-types"></div>
          <div class="stat-info">
            <span class="stat-value">${state.types.length}</span>
            <span class="stat-label">设备类型</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon stat-records"></div>
          <div class="stat-info">
            <span class="stat-value">${state.records.length}</span>
            <span class="stat-label">维修记录</span>
          </div>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-card">
          <h3>设备类型分布</h3>
          <div class="chart-wrap"><canvas id="chart-type"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>设备按NVR分布</h3>
          <div class="chart-wrap"><canvas id="chart-nvr"></canvas></div>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-card chart-card-wide ip-usage-card">
          <div class="ip-usage-header">
            <h3>IP 地址占用</h3>
            <select id="ip-subnet-select" class="ip-subnet-select"></select>
          </div>
          <div id="ip-usage-panel"></div>
        </div>
        <div class="chart-card chart-card-log">
          <h3>登录活动</h3>
          <div class="login-stats-row" id="login-stats-row"></div>
          <div class="recent-logins" id="recent-logins"><p class="text-muted">加载中...</p></div>
        </div>
      </div>
    </div>
  `;

  if (window.dashboardCharts) {
    Object.values(window.dashboardCharts).forEach(c => c.destroy());
  }
  window.dashboardCharts = {};

  renderNvrChart();
  renderTypeChart();
  renderIpUsagePanel();
  renderLoginActivity();

  // ---- Chart helpers ----

  function renderNvrChart() {
    const canvas = document.getElementById('chart-nvr');
    if (!canvas) return;
    const map = {};
    state.devices.forEach(d => {
      const name = d.nvr_name || '未分配';
      map[name] = (map[name] || 0) + 1;
    });
    const labels = Object.keys(map);
    const data = Object.values(map);
    const colors = generateColors(labels.length);

    canvas.style.height = Math.max(200, labels.length * 30) + 'px';

    window.dashboardCharts.nvr = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '设备数量',
          data,
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { stepSize: 1 } },
          y: { ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  function renderTypeChart() {
    const canvas = document.getElementById('chart-type');
    if (!canvas) return;
    const map = {};
    state.devices.forEach(d => {
      const name = d.device_type || '未分类';
      map[name] = (map[name] || 0) + 1;
    });
    const labels = Object.keys(map);
    const data = Object.values(map);
    const colors = generateColors(labels.length);

    window.dashboardCharts.type = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 1, borderColor: '#fff' }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, padding: 8, font: { size: 11 } } }
        }
      }
    });
  }

  function renderIpUsagePanel() {
    const panel = document.getElementById('ip-usage-panel');
    const select = document.getElementById('ip-subnet-select');
    if (!panel || !select) return;

    const subnetMap = buildSubnetMap();
    const subnets = Object.keys(subnetMap).sort(compareSubnetPrefix);

    if (!subnets.length) {
      select.innerHTML = '<option value="">暂无网段</option>';
      select.disabled = true;
      panel.innerHTML = '<p class="text-muted">设备列表中暂无合法 IPv4 地址。</p>';
      return;
    }

    select.disabled = false;
    if (!subnets.includes(state.dashboardSubnet)) {
      state.dashboardSubnet = subnets[0];
    }
    select.innerHTML = subnets.map(prefix => {
      const item = subnetMap[prefix];
      const label = `${prefix}.0/24（占用 ${item.occupied.size} / 剩余 ${254 - item.occupied.size}）`;
      return `<option value="${prefix}" ${prefix === state.dashboardSubnet ? 'selected' : ''}>${label}</option>`;
    }).join('');
    select.onchange = () => {
      state.dashboardSubnet = select.value;
      renderIpUsagePanel();
    };

    const subnet = subnetMap[state.dashboardSubnet];
    const cells = [];
    for (let host = 1; host <= 254; host++) {
      const devices = subnet.occupied.get(host) || [];
      const occupied = devices.length > 0;
      const ip = `${state.dashboardSubnet}.${host}`;
      const title = occupied
        ? `${ip}\n${devices.map(device => device.name || '未命名设备').join('\n')}`
        : `${ip}\n可用`;
      cells.push(`<div class="ip-cell ${occupied ? 'occupied' : 'available'}" title="${escapeHtml(title)}">${host}</div>`);
    }

    const occupiedCount = subnet.occupied.size;
    const availableCount = 254 - occupiedCount;
    const usedPercent = Math.round((occupiedCount / 254) * 100);
    const occupiedList = Array.from(subnet.occupied.keys()).sort((a, b) => a - b)
      .map(host => `${state.dashboardSubnet}.${host}`)
      .join('、') || '无';

    panel.innerHTML = `
      <div class="ip-summary-row">
        <div class="ip-summary-item occupied"><strong>${occupiedCount}</strong><span>已占用</span></div>
        <div class="ip-summary-item available"><strong>${availableCount}</strong><span>可用</span></div>
        <div class="ip-summary-item"><strong>${usedPercent}%</strong><span>占用率</span></div>
      </div>
      <div class="ip-legend">
        <span><i class="ip-dot occupied"></i>已占用</span>
        <span><i class="ip-dot available"></i>可用</span>
      </div>
      <div class="ip-grid">${cells.join('')}</div>
      <div class="ip-occupied-list"><span>已占用 IP：</span>${escapeHtml(occupiedList)}</div>
    `;
  }

  function buildSubnetMap() {
    const map = {};
    state.devices.forEach(device => {
      const parsed = parseIpv4(device.ip_address);
      if (!parsed || parsed.host < 1 || parsed.host > 254) return;
      if (!map[parsed.prefix]) {
        map[parsed.prefix] = { occupied: new Map() };
      }
      const devices = map[parsed.prefix].occupied.get(parsed.host) || [];
      devices.push(device);
      map[parsed.prefix].occupied.set(parsed.host, devices);
    });
    return map;
  }

  function parseIpv4(value) {
    const parts = String(value || '').trim().split('.');
    if (parts.length !== 4) return null;
    const nums = parts.map(part => {
      if (!/^\d{1,3}$/.test(part)) return NaN;
      return Number(part);
    });
    if (nums.some(num => Number.isNaN(num) || num < 0 || num > 255)) return null;
    return {
      prefix: nums.slice(0, 3).join('.'),
      host: nums[3]
    };
  }

  function compareSubnetPrefix(a, b) {
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if (left[i] !== right[i]) return left[i] - right[i];
    }
    return 0;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function renderLoginActivity() {
    if (!state.user || !state.user.is_admin) {
      document.getElementById('login-stats-row').innerHTML = '<p class="text-muted">仅主账号可见</p>';
      return;
    }
    sendRequest(`${endpoints.loginLogs}?page=1&pageSize=50`).then(data => {
      const logs = data.logs || [];
      const total = data.total || logs.length;
      const successes = logs.filter(l => l.success === 1).length;
      const failures = logs.filter(l => l.success === 0).length;

      document.getElementById('login-stats-row').innerHTML = `
        <div class="login-stat-item"><span class="stat-num">${total}</span><span class="stat-lbl">总登录</span></div>
        <div class="login-stat-item success"><span class="stat-num">${successes}</span><span class="stat-lbl">成功</span></div>
        <div class="login-stat-item failure"><span class="stat-num">${failures}</span><span class="stat-lbl">失败</span></div>
      `;

      const recent = document.getElementById('recent-logins');
      if (!logs.length) {
        recent.innerHTML = '<p class="text-muted">暂无登录记录</p>';
        return;
      }
      recent.innerHTML = `<div class="login-scroll">${logs.slice(0, 20).map(l => {
        const status = l.success === 1 ? '成功' : '失败';
        const cls = l.success === 1 ? 'tag-success' : 'tag-failure';
        const time = new Date(l.login_time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `<div class="login-row"><span class="login-user">${l.username}</span><span class="tag ${cls}">${status}</span><span class="login-time">${time}</span></div>`;
      }).join('')}</div>`;
    }).catch(() => {
      document.getElementById('login-stats-row').innerHTML = '<p class="text-muted">获取日志失败</p>';
    });
  }

  function generateColors(count) {
    const palette = [
      '#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
      '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
      '#06b6d4', '#d946ef', '#22c55e', '#eab308', '#3b82f6',
      '#a855f7', '#64748b', '#fb923c', '#38bdf8', '#4ade80'
    ];
    return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
  }
}

function renderDevices() {
  setPageTitle('设备列表');
  logoutBtn.hidden = false;
  const tpl = document.getElementById('devices-template');
  if (!tpl) return;
  mainPanel.innerHTML = tpl.innerHTML;
  const tbody = document.getElementById('device-list');
  const importInput = document.getElementById('device-import');
  const templateBtn = document.getElementById('download-template');
  const exportBtn = document.getElementById('export-selected');
  const deleteBtn = document.getElementById('delete-selected');
  const addBtn = document.getElementById('new-device');
  const searchInput = document.getElementById('device-search');
  const pageSizeSelect = document.getElementById('page-size');
  const pageInfo = document.getElementById('device-page-info');
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');
  const pageNumbers = document.getElementById('page-numbers');
  const selectAllCheckbox = document.getElementById('select-all');

  searchInput.value = state.deviceSearch;
  pageSizeSelect.value = state.devicePageSize;

  // 排序事件监听器
  const sortableHeaders = document.querySelectorAll('.sortable');
  sortableHeaders.forEach((header) => {
    header.addEventListener('click', () => {
      const sortField = header.dataset.sort;
      if (state.deviceSortField === sortField) {
        // 切换排序方向
        state.deviceSortDirection = state.deviceSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        // 新的排序字段，默认升序
        state.deviceSortField = sortField;
        state.deviceSortDirection = 'asc';
      }
      updateSortIndicators();
      refresh();
    });
  });

  function updateSortIndicators() {
    sortableHeaders.forEach((header) => {
      const indicator = header.querySelector('.sort-indicator');
      if (header.dataset.sort === state.deviceSortField) {
        header.classList.add('active');
        indicator.className = 'sort-indicator ' + state.deviceSortDirection;
      } else {
        header.classList.remove('active');
        indicator.className = 'sort-indicator';
      }
    });
  }

  updateSortIndicators();

  function getPageDevices() {
    const filtered = getFilteredDevices();
    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / state.devicePageSize));
    state.devicePageIndex = Math.min(state.devicePageIndex, pageCount);
    const offset = (state.devicePageIndex - 1) * state.devicePageSize;
    const pageDevices = filtered.slice(offset, offset + state.devicePageSize);
    pageInfo.textContent = `共 ${total} 条，当前第 ${state.devicePageIndex} / ${pageCount} 页`;
    prevBtn.disabled = state.devicePageIndex <= 1;
    nextBtn.disabled = state.devicePageIndex >= pageCount;
    renderPageNumbers(pageCount);
    return pageDevices;
  }

  function renderPageNumbers(pageCount) {
    const current = state.devicePageIndex;
    const maxVisible = 5;
    let parts = [];
    if (pageCount <= maxVisible + 2) {
      for (let i = 1; i <= pageCount; i++) parts.push(i);
    } else {
      parts.push(1);
      let start = Math.max(2, current - 1);
      let end = Math.min(pageCount - 1, current + 1);
      if (current <= 3) { start = 2; end = Math.min(pageCount - 1, 4); }
      if (current >= pageCount - 2) { start = Math.max(2, pageCount - 3); end = pageCount - 1; }
      if (start > 2) parts.push('...');
      for (let i = start; i <= end; i++) parts.push(i);
      if (end < pageCount - 1) parts.push('...');
      parts.push(pageCount);
    }
    pageNumbers.innerHTML = parts.map(p =>
      p === '...'
        ? '<span class="page-ellipsis">…</span>'
        : `<button class="page-btn${p === current ? ' active' : ''}" data-page="${p}">${p}</button>`
    ).join('');
  }

  function updateSelectAllCheckbox() {
    const pageDevices = getPageDevices();
    selectAllCheckbox.checked = pageDevices.length > 0 && pageDevices.every((device) => state.deviceSelected.has(device.id));
    updateBatchActionButtons();
  }

  function updateBatchActionButtons() {
    const count = state.deviceSelected.size;
    deleteBtn.disabled = count === 0;
    deleteBtn.textContent = count > 0 ? `删除所选 (${count})` : '删除所选';
  }

  function renderRows() {
    tbody.innerHTML = '';
    const pageDevices = getPageDevices();

    pageDevices.forEach((device) => {
      const hasRecord = state.records.some((record) => record.device_id === device.id);
      const iconHtml = hasRecord ? '<span class="record-icon" title="该设备有维修记录">✔</span>' : '';
      const row = document.createElement('tr');
      row.innerHTML = `
        <td data-label=""><input type="checkbox" class="device-checkbox" data-id="${device.id}" ${state.deviceSelected.has(device.id) ? 'checked' : ''} /></td>
        <td data-label="名称">${iconHtml} ${device.name || '-'}</td>
        <td data-label="类型">${device.device_type || '-'}</td>
        <td data-label="品牌"><span class="badge"><img src="${device.brand_logo || 'https://cdn.jsdelivr.net/gh/gitbrent/pimg@master/bitbucket.png'}" class="logo-avatar" alt=""> ${device.brand_name || '-'}</span></td>
        <td data-label="IP">${device.ip_address || '-'}</td>
        <td data-label="NVR">${device.nvr_name || '-'}</td>
        <td data-label="备注">${device.note || '-'}</td>
        <td data-label="">
          <button class="btn-secondary" data-action="edit" data-id="${device.id}">编辑</button>
          <button class="btn-secondary" data-action="delete" data-id="${device.id}">删除</button>
          <button class="btn-secondary" data-action="records" data-id="${device.id}">维修记录</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    updateSelectAllCheckbox();
  }

  function refresh() {
    renderRows();
  }

  tbody.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === 'edit') return openDeviceDialog(id);
    if (button.dataset.action === 'delete') return deleteDevice(id);
    if (button.dataset.action === 'records') return openDeviceRecords(id);
  });

  tbody.addEventListener('change', (event) => {
    const checkbox = event.target.closest('.device-checkbox');
    if (!checkbox) return;
    const id = Number(checkbox.dataset.id);
    if (checkbox.checked) state.deviceSelected.add(id);
    else state.deviceSelected.delete(id);
    updateSelectAllCheckbox();
  });

  selectAllCheckbox.addEventListener('change', () => {
    const isChecked = selectAllCheckbox.checked;
    const hasSearch = state.deviceSearch.trim() !== '';

    if (isChecked) {
      if (hasSearch) {
        // 有搜索时，只全选当前页的搜索结果
        const pageDevices = getPageDevices();
        pageDevices.forEach((device) => state.deviceSelected.add(device.id));
      } else {
        // 没有搜索时，全选所有设备
        state.devices.forEach((device) => state.deviceSelected.add(device.id));
      }
    } else {
      // 取消全选，清空所有选择
      state.deviceSelected.clear();
    }
    renderRows();
  });

  searchInput.addEventListener('input', () => {
    state.deviceSearch = searchInput.value;
    state.devicePageIndex = 1;
    refresh();
  });

  pageSizeSelect.addEventListener('change', () => {
    state.devicePageSize = Number(pageSizeSelect.value);
    state.devicePageIndex = 1;
    refresh();
  });

  prevBtn.addEventListener('click', () => {
    state.devicePageIndex = Math.max(1, state.devicePageIndex - 1);
    refresh();
  });

  nextBtn.addEventListener('click', () => {
    state.devicePageIndex += 1;
    refresh();
  });

  pageNumbers.addEventListener('click', (e) => {
    const btn = e.target.closest('.page-btn');
    if (!btn) return;
    state.devicePageIndex = Number(btn.dataset.page);
    refresh();
  });

  templateBtn.addEventListener('click', downloadTemplate);
  exportBtn.addEventListener('click', () => {
    const selectedIds = Array.from(state.deviceSelected);
    if (!selectedIds.length) {
      const pageDevices = getPageDevices();
      if (!pageDevices.length) return alert('当前没有可导出的设备');
      if (!confirm('未选择设备，是否导出当前页设备？')) return;
      return downloadExport(pageDevices.map((device) => device.id));
    }
    downloadExport(selectedIds);
  });
  deleteBtn.addEventListener('click', deleteSelectedDevices);
  importInput.addEventListener('change', handleDeviceImport);
  addBtn.addEventListener('click', () => openDeviceDialog());

  refresh();
}

function downloadBlob(url, filename) {
  fetch(url, { headers: { 'x-access-token': state.token } })
    .then((res) => {
      if (!res.ok) throw new Error('下载失败');
      return res.blob();
    })
    .then((blob) => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    })
    .catch((error) => alert(error.message));
}

function downloadTemplate() {
  downloadBlob(endpoints.template, 'device-template.csv');
}

function downloadExport(ids = []) {
  const query = ids.length ? '?ids=' + ids.join(',') : '';
  downloadBlob(endpoints.exportDevices + query, 'device-export.csv');
}

function getFilteredDevices() {
  const keyword = state.deviceSearch.trim().toLowerCase();
  let filtered = state.devices.filter((device) => {
    return [
      device.name,
      device.device_type,
      device.brand_name,
      device.ip_address,
      device.install_location,
      device.nvr_name,
      device.note
    ].some((value) => value && value.toString().toLowerCase().includes(keyword));
  });

  // 排序逻辑
  if (state.deviceSortField) {
    filtered.sort((a, b) => {
      const aValue = a[state.deviceSortField] || '';
      const bValue = b[state.deviceSortField] || '';

      // IP地址特殊排序
      if (state.deviceSortField === 'ip_address') {
        const aParts = aValue.split('.').map(n => parseInt(n, 10) || 0);
        const bParts = bValue.split('.').map(n => parseInt(n, 10) || 0);
        for (let i = 0; i < 4; i++) {
          if (aParts[i] !== bParts[i]) {
            return state.deviceSortDirection === 'asc' ? aParts[i] - bParts[i] : bParts[i] - aParts[i];
          }
        }
        return 0;
      }

      // 其他字段使用字符串排序
      const comparison = aValue.localeCompare(bValue, 'zh-CN');
      return state.deviceSortDirection === 'asc' ? comparison : -comparison;
    });
  }

  return filtered;
}

function openDeviceRecords(id) {
  const records = state.records.filter((record) => record.device_id === Number(id));
  if (!records.length) {
    return alert('该设备暂无维修记录');
  }
  const body = records.map((record) => `
    <div class="record-card">
      <strong>维修时间：</strong><span>${record.maintenance_time}</span><br>
      <strong>维修人员：</strong><span>${record.technician_name || '未知'}</span><br>
      <strong>维修内容：</strong><span>${record.content}</span><br>
      <strong>备注：</strong><span>${record.note || '-'}</span>
    </div>
  `).join('');
  openDialog('设备维修记录', body, () => {});
}

function renderTypes() {
  setPageTitle('类型与品牌维护');
  const tpl = document.getElementById('types-template').innerHTML;
  mainPanel.innerHTML = tpl;
  const typeList = document.getElementById('type-list');
  const brandList = document.getElementById('brand-list');
  const addTypeBtn = document.getElementById('new-type');
  const addBrandBtn = document.getElementById('new-brand');

  state.types.forEach((type) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td data-label="名称">${type.name}</td><td data-label=""><img src="${type.logo_url || 'https://cdn.jsdelivr.net/gh/gitbrent/pimg@master/bitbucket.png'}" class="logo-avatar" alt=""></td><td data-label=""><button class="btn-secondary" data-action="edit-type" data-id="${type.id}">编辑</button><button class="btn-secondary" data-action="delete-type" data-id="${type.id}">删除</button></td>`;
    typeList.appendChild(row);
  });

  state.brands.forEach((brand) => {
    const row = document.createElement('tr');
    row.innerHTML = `<td data-label="品牌">${brand.name}</td><td data-label=""><img src="${brand.logo_url || 'https://cdn.jsdelivr.net/gh/gitbrent/pimg@master/bitbucket.png'}" class="logo-avatar" alt=""></td><td data-label=""><button class="btn-secondary" data-action="edit-brand" data-id="${brand.id}">编辑</button><button class="btn-secondary" data-action="delete-brand" data-id="${brand.id}">删除</button></td>`;
    brandList.appendChild(row);
  });

  typeList.addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-type') return openTypeDialog(id);
    if (btn.dataset.action === 'delete-type') return deleteType(id);
  });
  brandList.addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-brand') return openBrandDialog(id);
    if (btn.dataset.action === 'delete-brand') return deleteBrand(id);
  });
  addTypeBtn.addEventListener('click', () => openTypeDialog());
  addBrandBtn.addEventListener('click', () => openBrandDialog());
}

function renderNvrs() {
  setPageTitle('录像机维护');
  const tpl = document.getElementById('nvrs-template').innerHTML;
  mainPanel.innerHTML = tpl;
  const list = document.getElementById('nvr-list');
  const addBtn = document.getElementById('new-nvr');

  state.nvrs.forEach((nvr) => {
    const row = document.createElement('tr');
    const brandLogo = nvr.brand_logo || 'https://cdn.jsdelivr.net/gh/gitbrent/pimg@master/bitbucket.png';
    row.innerHTML = `<td>${nvr.name || '-'}</td><td>${nvr.ip_address || '-'}</td><td><span class="badge"><img src="${brandLogo}" class="logo-avatar" alt=""> ${nvr.brand_name || '-'}</span></td><td>${nvr.install_location || '-'}</td><td>${nvr.storage_capacity || '-'}</td><td>${nvr.note || '-'}</td><td><button class="btn-secondary" data-action="edit" data-id="${nvr.id}">编辑</button><button class="btn-secondary" data-action="delete" data-id="${nvr.id}">删除</button></td>`;
    list.appendChild(row);
  });

  list.addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') return openNvrDialog(id);
    if (btn.dataset.action === 'delete') return deleteNvr(id);
  });
  addBtn.addEventListener('click', () => openNvrDialog());
}

function renderUsers() {
  setPageTitle('维修人员管理');
  const tpl = document.getElementById('users-template').innerHTML;
  mainPanel.innerHTML = tpl;
  const list = document.getElementById('user-list');
  const addBtn = document.getElementById('new-user');

  state.users.forEach((user) => {
    const row = document.createElement('tr');
    const icon = user.avatar_url || 'https://cdn.jsdelivr.net/gh/gitbrent/pimg@master/bitbucket.png';
    row.innerHTML = `<td>${user.username}</td><td>${user.display_name || '-'}</td><td><img src="${icon}" class="logo-avatar" alt=""></td><td>${user.is_admin ? '主账号' : (user.can_login ? '允许登录' : '禁止登录')}</td><td><button class="btn-secondary" data-id="${user.id}">编辑</button></td>`;
    list.appendChild(row);
  });

  list.addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;
    openUserDialog(btn.dataset.id);
  });
  addBtn.addEventListener('click', () => openUserDialog());
}

function renderRecords() {
  setPageTitle('维修记录');
  const tpl = document.getElementById('records-template').innerHTML;
  mainPanel.innerHTML = tpl;
  const list = document.getElementById('record-list');
  const addBtn = document.getElementById('new-record');

  state.records.forEach((record) => {
    const row = document.createElement('tr');
    // 处理多设备名称显示
    const deviceNames = record.device_names && Array.isArray(record.device_names)
      ? record.device_names.join(', ')
      : (record.device_name || '-');
    // 处理维修人员头像
    const technicianAvatar = record.technician_avatar || 'https://cdn.jsdelivr.net/gh/gitbrent/pimg@master/bitbucket.png';
    // 格式化时间显示
    let formattedTime = record.maintenance_time || '-';
    if (formattedTime && formattedTime.includes('T')) {
      const date = new Date(formattedTime);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        formattedTime = `${year}-${month}-${day} ${hours}:${minutes}`;
      }
    }
    row.innerHTML = `<td>${deviceNames}</td><td><span class="badge"><img src="${technicianAvatar}" class="logo-avatar" alt=""> ${record.technician_name || '-'}</span></td><td>${formattedTime}</td><td>${record.content || '-'}</td><td>${record.note || '-'}</td><td><button class="btn-secondary" data-action="edit" data-id="${record.id}">编辑</button><button class="btn-secondary" data-action="delete" data-id="${record.id}">删除</button></td>`;
    list.appendChild(row);
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === 'edit') return openRecordDialog(id);
    if (button.dataset.action === 'delete') return deleteRecord(id);
  });

  addBtn.addEventListener('click', () => openRecordDialog());
}

function renderLogs() {
  setPageTitle('系统日志');
  logoutBtn.hidden = false;
  mainPanel.innerHTML = `
    <div class="panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>账号</th>
            <th>登录状态</th>
            <th>登录时间</th>
            <th>IP地址</th>
          </tr>
        </thead>
        <tbody id="log-list"></tbody>
      </table>
      <div class="pagination-bar">
        <div class="pagination-left">
          <span id="log-page-info"></span>
          <select id="log-page-size" class="page-size-select">
            <option value="10">10 条/页</option>
            <option value="20">20 条/页</option>
            <option value="50">50 条/页</option>
            <option value="100">100 条/页</option>
          </select>
        </div>
        <div class="pagination-actions">
          <button class="btn-secondary" id="log-prev-page">上一页</button>
          <button class="btn-secondary" id="log-next-page">下一页</button>
        </div>
      </div>
    </div>
  `;

  const list = document.getElementById('log-list');
  const pageSizeSelect = document.getElementById('log-page-size');
  const pageInfo = document.getElementById('log-page-info');
  const prevBtn = document.getElementById('log-prev-page');
  const nextBtn = document.getElementById('log-next-page');

  let currentPage = 1;
  let pageSize = 10;
  let totalLogs = 0;

  pageSizeSelect.value = pageSize;

  function loadLogs() {
    sendRequest(`${endpoints.loginLogs}?page=${currentPage}&pageSize=${pageSize}`).then((data) => {
      state.logs = data.logs;
      totalLogs = data.total || data.logs.length;
      list.innerHTML = '';
      state.logs.forEach((log) => {
        const row = document.createElement('tr');
        const status = log.success === 1 ? '<span style="color: green;">成功</span>' : '<span style="color: red;">失败</span>';
        const formattedTime = log.login_time ? new Date(log.login_time).toLocaleString('zh-CN') : '-';
        // 去除IPv6前缀
        let ipAddress = log.ip_address || '-';
        if (ipAddress.startsWith('::ffff:')) {
          ipAddress = ipAddress.substring(7);
        }
        row.innerHTML = `<td>${log.username || '-'}</td><td>${status}</td><td>${formattedTime}</td><td>${ipAddress}</td>`;
        list.appendChild(row);
      });
      pageInfo.textContent = `第 ${currentPage} 页，共 ${Math.ceil(totalLogs / pageSize)} 页`;
      prevBtn.disabled = currentPage === 1;
      nextBtn.disabled = currentPage >= Math.ceil(totalLogs / pageSize);
    }).catch((error) => {
      console.error('获取登录日志失败:', error);
      alert('获取登录日志失败');
    });
  }

  loadLogs();

  pageSizeSelect.addEventListener('change', () => {
    pageSize = parseInt(pageSizeSelect.value);
    currentPage = 1;
    loadLogs();
  });

  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadLogs();
    }
  });

  nextBtn.addEventListener('click', () => {
    currentPage++;
    loadLogs();
  });
}

function renderSettings() {
  setPageTitle('系统设置');
  logoutBtn.hidden = false;
  mainPanel.innerHTML = `
    <div class="panel">
      <div class="settings-container">
        <div class="settings-card">
          <h3>系统 Logo</h3>
          <div class="logo-upload-section">
            <input id="settings-site-logo" type="hidden" value="" />
            <img id="settings-logo-preview" class="logo-preview" src="${DEFAULT_LOGO_URL}" alt="Logo 预览" />
            <div class="button-group">
              <label class="btn-secondary input-file">
                上传 Logo
                <input id="settings-logo-upload" type="file" accept="image/*" hidden />
              </label>
              <button type="button" class="btn-secondary" id="settings-remove-logo" style="display: none;">恢复默认</button>
            </div>
            <p class="settings-hint">Logo 将显示在登录页和左侧导航栏，建议使用正方形图片；未设置时使用默认 Logo。</p>
          </div>
        </div>
        <div class="settings-card">
          <h3>登录背景设置</h3>
          <div class="background-upload-section">
            <input id="settings-login-background" type="hidden" value="" />
            <img id="settings-background-preview" class="background-preview" style="max-width: 100%; max-height: 150px; margin-bottom: 10px; border-radius: 8px; display: none;" />
            <div class="button-group">
              <label class="btn-secondary input-file">
                上传背景
                <input id="settings-background-upload" type="file" accept="image/*" hidden />
              </label>
              <button type="button" class="btn-secondary" id="settings-remove-background" style="display: none;">删除背景</button>
            </div>
          </div>
        </div>
        <div class="settings-card">
          <h3>上传文件大小限制</h3>
          <div class="form-row">
            <label>最大文件大小 (MB)</label>
            <div class="form-input-group">
              <input id="settings-max-file-size" type="number" min="1" max="20" value="20" class="settings-input" />
              <button class="btn-primary" id="settings-save-file-size">保存</button>
            </div>
          </div>
        </div>
        <div class="settings-card">
          <h3>日志保留天数</h3>
          <div class="form-row">
            <label>保留天数</label>
            <div class="form-input-group">
              <select id="settings-log-retention" class="settings-select">
                <option value="30">30天</option>
                <option value="90">90天</option>
                <option value="180">180天</option>
                <option value="0">永久</option>
              </select>
              <button class="btn-primary" id="settings-save-log-retention">保存</button>
            </div>
          </div>
        </div>
        <div class="settings-card">
          <h3>数据备份</h3>
          <div class="form-row">
            <button class="btn-primary" id="settings-backup">导出数据备份</button>
          </div>
        </div>
        <div class="settings-card settings-version">
          <span class="version-label">IT Ledger</span>
          <span class="version-number">v1.01</span>
        </div>
      </div>
    </div>
  `;

  // 加载当前设置
  sendRequest(endpoints.settings).then((data) => {
    if (data.settings) {
      if (data.settings.site_logo_url) {
        document.getElementById('settings-site-logo').value = data.settings.site_logo_url;
        document.getElementById('settings-logo-preview').src = data.settings.site_logo_url;
        document.getElementById('settings-remove-logo').style.display = 'inline-block';
        applySiteLogo(data.settings.site_logo_url);
      }
      if (data.settings.login_background_url) {
        document.getElementById('settings-login-background').value = data.settings.login_background_url;
        document.getElementById('settings-background-preview').src = data.settings.login_background_url;
        document.getElementById('settings-background-preview').style.display = 'block';
        document.getElementById('settings-remove-background').style.display = 'inline-block';
      }
      if (data.settings.max_file_size) {
        document.getElementById('settings-max-file-size').value = data.settings.max_file_size;
      }
      if (data.settings.log_retention) {
        document.getElementById('settings-log-retention').value = data.settings.log_retention;
      }
    }
  }).catch((error) => {
    console.error('获取系统设置失败:', error);
  });

  document.getElementById('settings-logo-upload').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const maxSizeMB = parseInt(document.getElementById('settings-max-file-size').value) || 20;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert(`文件大小超过限制（最大${maxSizeMB}MB）`);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    fetch('/api/upload-logo', {
      method: 'POST',
      headers: { 'x-access-token': state.token },
      body: formData
    }).then((res) => res.json()).then((data) => {
      if (data.success) {
        const logoUrl = data.url;
        document.getElementById('settings-site-logo').value = logoUrl;
        document.getElementById('settings-logo-preview').src = logoUrl;
        document.getElementById('settings-remove-logo').style.display = 'inline-block';
        applySiteLogo(logoUrl);
        alert('上传 Logo 成功');
        sendRequest(endpoints.settings, 'POST', { key: 'site_logo_url', value: logoUrl });
      } else {
        alert('上传 Logo 失败: ' + (data.message || '未知错误'));
      }
    }).catch((error) => {
      console.error('上传 Logo 失败:', error);
      alert('上传 Logo 失败');
    });
  });

  document.getElementById('settings-remove-logo').addEventListener('click', () => {
    if (!confirm('确定恢复为默认 Logo 吗？')) return;
    document.getElementById('settings-site-logo').value = '';
    document.getElementById('settings-logo-preview').src = DEFAULT_LOGO_URL;
    document.getElementById('settings-remove-logo').style.display = 'none';
    applySiteLogo(null);
    alert('已恢复默认 Logo');
    sendRequest(endpoints.settings, 'POST', { key: 'site_logo_url', value: '' });
  });

  // 登录背景上传
  document.getElementById('settings-background-upload').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // 检查文件大小
    const maxSizeMB = parseInt(document.getElementById('settings-max-file-size').value) || 20;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert(`文件大小超过限制（最大${maxSizeMB}MB）`);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    fetch('/api/upload-background', {
      method: 'POST',
      headers: { 'x-access-token': state.token },
      body: formData
    }).then((res) => res.json()).then((data) => {
      if (data.success) {
        const backgroundUrl = data.url;
        document.getElementById('settings-login-background').value = backgroundUrl;
        document.getElementById('settings-background-preview').src = backgroundUrl;
        document.getElementById('settings-background-preview').style.display = 'block';
        document.getElementById('settings-remove-background').style.display = 'inline-block';
        alert('上传背景成功');
        // 保存到系统设置
        sendRequest(endpoints.settings, 'POST', { key: 'login_background_url', value: backgroundUrl });
        // 更新admin用户的登录背景
        sendRequest('/api/users/1', 'PUT', { login_background_url: backgroundUrl });
      } else {
        alert('上传背景失败: ' + (data.message || '未知错误'));
      }
    }).catch((error) => {
      console.error('上传背景失败:', error);
      alert('上传背景失败');
    });
  });

  // 删除登录背景
  document.getElementById('settings-remove-background').addEventListener('click', () => {
    if (!confirm('确定要删除登录背景吗？')) return;
    document.getElementById('settings-login-background').value = '';
    document.getElementById('settings-background-preview').style.display = 'none';
    document.getElementById('settings-remove-background').style.display = 'none';
    alert('删除背景成功');
    // 保存到系统设置
    sendRequest(endpoints.settings, 'POST', { key: 'login_background_url', value: '' });
    // 更新admin用户的登录背景
    sendRequest('/api/users/1', 'PUT', { login_background_url: '' });
  });

  // 保存文件大小限制
  document.getElementById('settings-save-file-size').addEventListener('click', () => {
    const maxSize = document.getElementById('settings-max-file-size').value;
    if (maxSize < 1 || maxSize > 20) {
      alert('文件大小限制必须在1-20MB之间');
      return;
    }
    sendRequest(endpoints.settings, 'POST', { key: 'max_file_size', value: maxSize }).then(() => {
      alert('保存成功');
    }).catch((error) => {
      console.error('保存失败:', error);
      alert('保存失败');
    });
  });

  // 保存日志保留天数
  document.getElementById('settings-save-log-retention').addEventListener('click', () => {
    const retention = document.getElementById('settings-log-retention').value;
    sendRequest(endpoints.settings, 'POST', { key: 'log_retention', value: retention }).then(() => {
      alert('保存成功');
    }).catch((error) => {
      console.error('保存失败:', error);
      alert('保存失败');
    });
  });

  // 导出数据备份
  document.getElementById('settings-backup').addEventListener('click', () => {
    fetch(endpoints.backup, {
      headers: { 'x-access-token': state.token }
    })
      .then((res) => {
        if (!res.ok) throw new Error('下载失败');
        // 从响应头获取文件名
        const contentDisposition = res.headers.get('Content-Disposition');
        let filename = 'data.db';
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="(.+)"/);
          if (match) filename = match[1];
        }
        return res.blob().then((blob) => ({ blob, filename }));
      })
      .then(({ blob, filename }) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      })
      .catch((error) => alert(error.message));
  });
}

function openDialog(title, bodyHtml, onSubmit) {
  const template = document.getElementById('dialog-template').innerHTML;
  mainPanel.insertAdjacentHTML('beforeend', template);
  document.getElementById('dialog-title').textContent = title;
  document.getElementById('dialog-body').innerHTML = bodyHtml;
  const modal = document.querySelector('.modal-backdrop');
  const submitBtn = document.getElementById('dialog-submit');
  document.getElementById('dialog-cancel').addEventListener('click', () => modal.remove());
  submitBtn.addEventListener('click', () => {
    const result = onSubmit();
    if (result && typeof result.then === 'function') {
      submitBtn.disabled = true;
      submitBtn.textContent = '保存中...';
      result.then(() => {
        modal.remove();
      }).catch((error) => {
        alert(error.message || '保存失败');
        submitBtn.disabled = false;
        submitBtn.textContent = '保存';
      });
    } else {
      modal.remove();
    }
  });
  return modal;
}

function openDeviceDialog(id) {
  const device = state.devices.find((item) => item.id === Number(id)) || {};
  const body = `
    <label>设备名称</label><input id="device-name" type="text" value="${device.name || ''}" />
    <label>设备类型</label><select id="device-type">${state.types.map((type) => `<option value="${type.id}" ${device.device_type_id === type.id ? 'selected' : ''}>${type.name}</option>`).join('')}</select>
    <label>品牌</label><select id="device-brand"><option value="">无</option>${state.brands.map((brand, i) => `<option value="${brand.id}" ${(!device.brand_id && i === 0) || device.brand_id === brand.id ? 'selected' : ''}>${brand.name}</option>`).join('')}</select>
    <label>IP 地址</label><input id="device-ip" type="text" value="${device.ip_address || ''}" />
    <label>所属 NVR</label><select id="device-nvr"><option value="">无</option>${state.nvrs.map((nvr) => `<option value="${nvr.id}" ${device.nvr_id === nvr.id ? 'selected' : ''}>${nvr.name}</option>`).join('')}</select>
    <label>备注</label><textarea id="device-note">${device.note || ''}</textarea>
  `;
  openDialog(device.id ? '编辑设备' : '新增设备', body, () => {
    const payload = {
      name: document.getElementById('device-name').value.trim(),
      device_type_id: Number(document.getElementById('device-type').value) || null,
      brand_id: Number(document.getElementById('device-brand').value) || null,
      ip_address: document.getElementById('device-ip').value.trim(),
      nvr_id: Number(document.getElementById('device-nvr').value) || null,
      note: document.getElementById('device-note').value.trim()
    };
    const action = device.id ? sendRequest(`${endpoints.devices}/${device.id}`, 'PUT', payload) : sendRequest(endpoints.devices, 'POST', payload);
    return action.then(() => reloadData('devices'));
  });
}

function openTypeDialog(id) {
  const item = state.types.find((entry) => entry.id === Number(id)) || {};
  const body = `
    <label>类型名称</label><input id="type-name" type="text" value="${item.name || ''}" />
    <label>Logo 地址</label><input id="type-logo" type="url" value="${item.logo_url || ''}" />
  `;
  openDialog(item.id ? '编辑类型' : '新增类型', body, () => {
    const payload = { name: document.getElementById('type-name').value.trim(), logo_url: document.getElementById('type-logo').value.trim() };
    const action = item.id ? sendRequest(`${endpoints.deviceTypes}/${item.id}`, 'PUT', payload) : sendRequest(endpoints.deviceTypes, 'POST', payload);
    return action.then(() => reloadData('types'));
  });
}

function openBrandDialog(id) {
  const item = state.brands.find((entry) => entry.id === Number(id)) || {};
  const body = `
    <label>品牌名称</label><input id="brand-name" type="text" value="${item.name || ''}" />
    <label>Logo 地址</label><input id="brand-logo" type="url" value="${item.logo_url || ''}" />
  `;
  openDialog(item.id ? '编辑品牌' : '新增品牌', body, () => {
    const payload = { name: document.getElementById('brand-name').value.trim(), logo_url: document.getElementById('brand-logo').value.trim() };
    const action = item.id ? sendRequest(`${endpoints.brands}/${item.id}`, 'PUT', payload) : sendRequest(endpoints.brands, 'POST', payload);
    return action.then(() => reloadAll(['types', 'brands', 'devices', 'nvrs']));
  });
}

function openNvrDialog(id) {
  const item = state.nvrs.find((entry) => entry.id === Number(id)) || {};
  const body = `
    <label>录像机名称</label><input id="nvr-name" type="text" value="${item.name || ''}" />
    <label>IP 地址</label><input id="nvr-ip" type="text" value="${item.ip_address || ''}" />
    <label>品牌</label><select id="nvr-brand"><option value="">无</option>${state.brands.map((brand) => `<option value="${brand.id}" ${item.brand_id === brand.id ? 'selected' : ''}>${brand.name}</option>`).join('')}</select>
    <label>安装位置</label><input id="nvr-location" type="text" value="${item.install_location || ''}" />
    <label>存储容量</label><input id="nvr-storage" type="text" value="${item.storage_capacity || ''}" />
    <label>备注</label><textarea id="nvr-note">${item.note || ''}</textarea>
  `;
  openDialog(item.id ? '编辑录像机' : '新增录像机', body, () => {
    const payload = {
      name: document.getElementById('nvr-name').value.trim(),
      ip_address: document.getElementById('nvr-ip').value.trim(),
      brand_id: Number(document.getElementById('nvr-brand').value) || null,
      install_location: document.getElementById('nvr-location').value.trim(),
      storage_capacity: document.getElementById('nvr-storage').value.trim(),
      note: document.getElementById('nvr-note').value.trim()
    };
    const action = item.id ? sendRequest(`${endpoints.nvrs}/${item.id}`, 'PUT', payload) : sendRequest(endpoints.nvrs, 'POST', payload);
    return action.then(() => reloadAll(['nvrs', 'devices']));
  });
}

function openUserDialog(id) {
  const user = state.users.find((entry) => entry.id === Number(id)) || {};
  const isAdmin = user.is_admin || (state.user && state.user.is_admin);
  const body = `
    <label>账号</label><input id="user-username" type="text" value="${user.username || ''}" ${user.id ? 'disabled' : ''} />
    <label>姓名</label><input id="user-name" type="text" value="${user.display_name || ''}" />
    <label>头像</label>
    <div class="avatar-upload-section">
      <input id="user-avatar" type="hidden" value="${user.avatar_url || ''}" />
      ${user.avatar_url ? `<img src="${user.avatar_url}" class="avatar-preview" style="max-width: 100%; max-height: 100px; margin-bottom: 10px; border-radius: 50%; object-fit: cover;" />` : ''}
      <label class="btn-secondary input-file">
        ${user.avatar_url ? '更换头像' : '上传头像'}
        <input id="avatar-upload" type="file" accept="image/*" hidden />
      </label>
      ${user.avatar_url ? `<button type="button" class="btn-secondary" id="remove-avatar" style="margin-left: 10px;">删除头像</button>` : ''}
    </div>
    <label>密码</label><input id="user-password" type="password" placeholder="${user.id ? '留空则不修改' : '请输入密码'}" />
    <label>是否主账号</label><select id="user-admin"><option value="0" ${user.is_admin ? '' : 'selected'}>否</option><option value="1" ${user.is_admin ? 'selected' : ''}>是</option></select>
    ${!user.is_admin ? `
    <label>允许登录</label><select id="user-can-login"><option value="0" ${user.can_login === 1 ? '' : 'selected'}>否</option><option value="1" ${user.can_login === 1 ? 'selected' : ''}>是</option></select>
    ` : ''}
  `;
  const modal = openDialog(user.id ? '编辑维修人员' : '新增维修人员', body, () => {
    const payload = {
      username: user.username || document.getElementById('user-username').value.trim(),
      password: document.getElementById('user-password').value,
      display_name: document.getElementById('user-name').value.trim(),
      avatar_url: document.getElementById('user-avatar').value.trim(),
      is_admin: document.getElementById('user-admin').value === '1'
    };
    if (!user.is_admin) {
      payload.can_login = document.getElementById('user-can-login').value === '1';
    }
    const action = user.id ? sendRequest(`${endpoints.users}/${user.id}`, 'PUT', payload) : sendRequest(endpoints.users, 'POST', payload);
    return action.then(() => {
      // 如果编辑的是当前登录用户，更新localStorage中的用户信息
      if (user.id && state.user && state.user.id === user.id) {
        state.user.avatar_url = payload.avatar_url;
        state.user.display_name = payload.display_name;
        localStorage.setItem('it_ledger_user', JSON.stringify(state.user));
      }
      return reloadAll(['users']);
    });
  });

  // 头像上传功能
  const avatarUpload = modal.querySelector('#avatar-upload');
  const avatarInput = modal.querySelector('#user-avatar');
  const removeAvatarBtn = modal.querySelector('#remove-avatar');

  if (avatarUpload) {
    avatarUpload.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (!file) return;

      // 检查文件大小
      const maxSizeMB = 20; // 默认20MB
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        alert(`文件大小超过限制（最大${maxSizeMB}MB）`);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      fetch('/api/upload-avatar', {
        method: 'POST',
        headers: { 'x-access-token': state.token },
        body: formData
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.success) return alert('上传失败：' + (data.message || '未知错误'));
          avatarInput.value = data.url;
          alert('头像上传成功');
          // 刷新预览
          const preview = modal.querySelector('.avatar-preview');
          if (preview) {
            preview.src = data.url;
          } else {
            const section = modal.querySelector('.avatar-upload-section');
            const img = document.createElement('img');
            img.src = data.url;
            img.className = 'avatar-preview';
            img.style.cssText = 'max-width: 100%; max-height: 100px; margin-bottom: 10px; border-radius: 50%; object-fit: cover;';
            section.insertBefore(img, section.firstChild);
          }
          // 更新localStorage中的用户信息
          if (state.user) {
            state.user.avatar_url = data.url;
            localStorage.setItem('it_ledger_user', JSON.stringify(state.user));
          }
        })
        .catch((error) => alert('上传失败：' + error.message));
    });
  }

  if (removeAvatarBtn) {
    removeAvatarBtn.addEventListener('click', () => {
      avatarInput.value = '';
      const preview = modal.querySelector('.avatar-preview');
      if (preview) preview.remove();
      removeAvatarBtn.remove();
      // 更新localStorage中的用户信息
      if (state.user) {
        state.user.avatar_url = '';
        localStorage.setItem('it_ledger_user', JSON.stringify(state.user));
      }
    });
  }
}

function openRecordDialog(id) {
  const record = id ? state.records.find((r) => r.id === Number(id)) : null;
  const maintenanceUsers = state.users.filter((user) => !user.is_admin);
  if (!maintenanceUsers.length && state.user) maintenanceUsers.push(state.user);
  const defaultTechnician = maintenanceUsers[0] || state.user || { id: 0, display_name: '未知' };

  let dateNow, timeNow;
  let selectedDeviceIds = [];

  if (record) {
    // 编辑模式：解析现有数据
    const date = new Date(record.maintenance_time);
    if (!isNaN(date.getTime())) {
      dateNow = date.toISOString().slice(0, 10);
      timeNow = date.toTimeString().slice(0, 5);
    } else {
      const now = new Date();
      dateNow = now.toISOString().slice(0, 10);
      timeNow = now.toTimeString().slice(0, 5);
    }

    // 解析设备ID
    if (record.device_ids) {
      try {
        selectedDeviceIds = JSON.parse(record.device_ids) || [];
      } catch (e) {
        selectedDeviceIds = record.device_id ? [record.device_id] : [];
      }
    } else if (record.device_id) {
      selectedDeviceIds = [record.device_id];
    }
  } else {
    // 新增模式：使用当前时间
    const now = new Date();
    dateNow = now.toISOString().slice(0, 10);
    timeNow = now.toTimeString().slice(0, 5);
  }

  const body = `
    <form id="record-form">
      <div class="record-section record-device-section">
        <label>维修设备（可多选，请勾选下面设备）</label>
        <div class="record-device-search-wrap">
          <input id="record-device-search" class="search-input" placeholder="输入设备名称过滤列表，勾选后保存" />
        </div>
        <div class="record-device-list" id="record-device-list">
          ${state.devices.map((device) => `<label class="record-device-item"><input type="checkbox" name="device_ids" value="${device.id}" ${selectedDeviceIds.includes(device.id) ? 'checked' : ''} /> ${device.name}</label>`).join('')}
          <label class="record-device-item"><input type="checkbox" id="record-device-other" name="device_other" value="other" ${record && !selectedDeviceIds.length ? 'checked' : ''} /> 其他（设备列表外）</label>
        </div>
        <div class="record-help">搜索只是过滤列表，必须勾选设备项才能保存。</div>
      </div>
      <div class="record-section">
        <label>维修人员</label>
        <select id="record-tech" name="technician_id">
          ${maintenanceUsers.map((user) => `<option value="${user.id}" ${record && record.technician_id === user.id ? 'selected' : ''}>${user.display_name || user.username}</option>`).join('')}
        </select>
      </div>
      <div class="record-section datetime-row">
        <div>
          <label>维修日期</label>
          <input id="record-date" name="maintenance_date" type="date" value="${dateNow}" />
        </div>
        <div>
          <label>维修时间</label>
          <input id="record-time" name="maintenance_time" type="time" value="${timeNow}" />
        </div>
      </div>
      <div class="record-section">
        <label>维修内容</label>
        <textarea id="record-content" name="content">${record ? (record.content || '') : ''}</textarea>
      </div>
      <div class="record-section">
        <label>备注</label>
        <textarea id="record-note" name="note">${record ? (record.note || '') : ''}</textarea>
      </div>
    </form>
  `;
  const modal = openDialog(record ? '编辑维修记录' : '新增维修记录', body, () => {
    const form = modal.querySelector('#record-form');
    if (!form) {
      return Promise.reject(new Error('维修记录表单未正确加载，请刷新页面后重试'));
    }

    const deviceCheckboxes = Array.from(form.querySelectorAll('input[name="device_ids"]'));
    const selected = deviceCheckboxes.filter((cb) => cb.checked).map((cb) => Number(cb.value)).filter((val) => val > 0);
    const otherCheckbox = form.querySelector('#record-device-other');
    const otherChecked = otherCheckbox && otherCheckbox.checked;
    const techSelect = form.querySelector('select[name="technician_id"]');
    const technicianId = techSelect ? Number(techSelect.value) : 0;
    const dateInput = form.querySelector('input[name="maintenance_date"]');
    const timeInput = form.querySelector('input[name="maintenance_time"]');
    const maintenanceDate = dateInput ? dateInput.value : '';
    const maintenanceTimeValue = timeInput ? timeInput.value : '';
    const maintenanceTime = (maintenanceDate && maintenanceTimeValue) ? `${maintenanceDate}T${maintenanceTimeValue}` : '';
    const contentTA = form.querySelector('textarea[name="content"]');
    const content = contentTA ? contentTA.value.trim() : '';
    const noteTA = form.querySelector('textarea[name="note"]');
    const note = noteTA ? noteTA.value.trim() : '';

    if (!otherChecked && selected.length === 0) {
      return Promise.reject(new Error('请勾选维修设备或选择"其他"'));
    }
    if (technicianId <= 0) {
      return Promise.reject(new Error('请选择维修人员'));
    }
    if (!maintenanceTime) {
      return Promise.reject(new Error('请填写维修日期和时间'));
    }
    if (!content) {
      return Promise.reject(new Error('请填写维修内容'));
    }

    const payload = {
      device_ids: otherChecked ? [] : selected,
      technician_id: technicianId,
      maintenance_time: maintenanceTime,
      content,
      note
    };

    const action = record ? sendRequest(`${endpoints.records}/${record.id}`, 'PUT', payload) : sendRequest(endpoints.records, 'POST', payload);
    return action.then(() => {
      alert(record ? '维修记录已更新' : '维修记录已保存');
      return reloadAll(['records']);
    });
  });

  const searchInput = modal.querySelector('#record-device-search');
  const deviceItems = Array.from(modal.querySelectorAll('.record-device-item'));
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim().toLowerCase();
      deviceItems.forEach((item) => {
        const text = item.textContent.trim().toLowerCase();
        if (text.includes('其他')) return;
        item.style.display = query && !text.includes(query) ? 'none' : 'flex';
      });
    });
  }

  const otherCheckbox = modal.querySelector('#record-device-other');
  if (otherCheckbox) {
    otherCheckbox.addEventListener('change', () => {
      if (otherCheckbox.checked) {
        modal.querySelectorAll('#record-device-list input[name="device_ids"]').forEach((checkbox) => {
          checkbox.checked = false;
        });
      }
    });
  }
}

function deleteRecord(id) {
  if (!confirm('确定要删除这条维修记录吗？')) return;
  sendRequest(`${endpoints.records}/${id}`, 'DELETE')
    .then(() => {
      alert('维修记录已删除');
      reloadAll(['records']);
    })
    .catch((error) => alert('删除失败：' + error.message));
}

function deleteDevice(id) {
  if (!confirm('确定删除该设备吗？')) return;
  sendRequest(`${endpoints.devices}/${id}`, 'DELETE').then(() => reloadAll(['devices']));
}

function deleteSelectedDevices() {
  const selectedIds = Array.from(state.deviceSelected);
  if (!selectedIds.length) {
    alert('请先选择要删除的设备');
    return;
  }
  if (!confirm(`确定删除选中的 ${selectedIds.length} 台设备吗？此操作不可恢复。`)) return;
  sendRequest(endpoints.batchDeleteDevices, 'POST', { ids: selectedIds })
    .then(() => {
      state.deviceSelected.clear();
      reloadAll(['devices']);
    })
    .catch((error) => alert('删除失败：' + error.message));
}

function deleteType(id) {
  if (!confirm('确定删除该类型吗？')) return;
  sendRequest(`${endpoints.deviceTypes}/${id}`, 'DELETE').then(() => reloadAll(['types', 'devices']));
}

function deleteBrand(id) {
  if (!confirm('确定删除该品牌吗？')) return;
  sendRequest(`${endpoints.brands}/${id}`, 'DELETE').then(() => reloadAll(['brands', 'devices', 'nvrs']));
}

function deleteNvr(id) {
  if (!confirm('确定删除该录像机吗？')) return;
  sendRequest(`${endpoints.nvrs}/${id}`, 'DELETE').then(() => reloadAll(['nvrs', 'devices']));
}

function handleDeviceImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  fetch(endpoints.importDevices, { method: 'POST', headers: { 'x-access-token': state.token }, body: form })
    .then((res) => res.json())
    .then((data) => {
      if (!data.success) {
        let message = data.message || '导入失败';
        if (data.errors && data.errors.length > 0) {
          message += '\n\n⚠️ 错误详情：\n' + data.errors.join('\n');
        }
        alert(message);
        return;
      }
      let message = data.message;
      if (data.errors && data.errors.length > 0) {
        message += '\n\n⚠️ 警告详情：\n' + data.errors.join('\n');
        alert(message);
      } else {
        alert(message);
      }
      reloadAll(['devices']);
    })
    .catch((error) => alert('导入失败：' + error.message));
  // 清空文件选择，允许重复选择同一文件
  event.target.value = '';
}

function reloadData(name) {
  switch (name) {
    case 'devices': return sendRequest(endpoints.devices).then((data) => { state.devices = data.devices; renderDevices(); });
    case 'types': return sendRequest(endpoints.deviceTypes).then((data) => { state.types = data.types; renderTypes(); });
    case 'brands': return sendRequest(endpoints.brands).then((data) => { state.brands = data.brands; renderTypes(); });
    case 'nvrs': return sendRequest(endpoints.nvrs).then((data) => { state.nvrs = data.nvrs; renderNvrs(); });
    case 'users': return sendRequest(endpoints.users).then((data) => { state.users = data.users; renderUsers(); });
    case 'records': return sendRequest(endpoints.records).then((data) => { state.records = data.records; renderRecords(); });
    default: return Promise.resolve();
  }
}

function reloadAll(names = []) {
  const promises = names.map((name) => {
    switch (name) {
      case 'devices': return sendRequest(endpoints.devices).then((data) => state.devices = data.devices);
      case 'types': return sendRequest(endpoints.deviceTypes).then((data) => state.types = data.types);
      case 'brands': return sendRequest(endpoints.brands).then((data) => state.brands = data.brands);
      case 'nvrs': return sendRequest(endpoints.nvrs).then((data) => state.nvrs = data.nvrs);
      case 'users': return sendRequest(endpoints.users).then((data) => state.users = data.users);
      case 'records': return sendRequest(endpoints.records).then((data) => state.records = data.records);
      default: return Promise.resolve();
    }
  });
  return Promise.all(promises).then(() => {
    if ((names.includes('devices') || names.includes('records')) && document.querySelector('#device-list')) renderDevices();
    if (names.includes('types') && document.querySelector('#type-list')) renderTypes();
    if (names.includes('nvrs') && document.querySelector('#nvr-list')) renderNvrs();
    if (names.includes('users') && document.querySelector('#user-list')) renderUsers();
    if (names.includes('records') && document.querySelector('#record-list')) renderRecords();
  });
}

logoutBtn.addEventListener('click', logout);

// ---- 移动端底部导航栏 ----

const TABBAR_ITEMS = [
  { id: 'dashboard', label: '首页', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { id: 'devices', label: '设备', icon: 'M10 3.34a13.78 13.78 0 01-3.66 2.68l-.12.05A8 8 0 004 12v5a2 2 0 002 2h12a2 2 0 002-2v-5a8 8 0 00-2.22-5.93l-.12-.05A13.78 13.78 0 0114 3.34M10 3.34l.22.65A13.78 13.78 0 0114 3.34M10 3.34A13.94 13.94 0 0012 3a13.94 13.94 0 012 .34M14 3.34l.22.65' },
  { id: 'types', label: '类型', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { id: 'nvrs', label: '录像', icon: 'M15 10l4.55-2.27A1 1 0 0121 8.64v6.72a1 1 0 01-1.45.9L15 14M5 5h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z' },
  { id: '__more__', label: '更多', icon: 'M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z' }
];

const MORE_ITEMS = [
  { id: 'users', label: '维修人员', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { id: 'records', label: '维修记录', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { id: 'logs', label: '系统日志', adminOnly: true, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.59a1 1 0 01.7.29l5.42 5.42a1 1 0 01.29.7V19a2 2 0 01-2 2z' },
  { id: 'settings', label: '系统设置', adminOnly: true, icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' }
];

function renderMobileTabBar() {
  const el = document.getElementById('mobile-tabbar');
  if (!el) return;
  el.innerHTML = TABBAR_ITEMS.map(item => {
    const isMore = item.id === '__more__';
    return `<button class="tabbar-item${isMore ? ' more-btn' : ''}" data-tab="${item.id}">
      <span class="tabbar-icon" style="mask-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='${item.icon}'/%3E%3C/svg%3E&quot;); -webkit-mask-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='${item.icon}'/%3E%3C/svg%3E&quot;); background: currentColor;"></span>
      <span>${item.label}</span>
    </button>`;
  }).join('');

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('.tabbar-item');
    if (!btn) return;
    if (btn.dataset.tab === '__more__') {
      toggleMorePopup(true);
      return;
    }
    toggleMorePopup(false);
    gotoPage(btn.dataset.tab);
  });
}

function renderMobileMorePopup() {
  const el = document.getElementById('mobile-more-popup');
  if (!el) return;
  const items = MORE_ITEMS.filter(item => {
    if (item.adminOnly && (!state.user || !state.user.is_admin)) return false;
    return true;
  });
  el.innerHTML = `
    <div class="more-popup-title">更多功能</div>
    <div class="more-popup-items">
      ${items.map(item => `
        <button class="more-popup-item" data-page="${item.id}">
          <span class="popup-icon" style="mask-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='${item.icon}'/%3E%3C/svg%3E&quot;); -webkit-mask-image: url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='${item.icon}'/%3E%3C/svg%3E&quot;); background: currentColor;"></span>
          <span>${item.label}</span>
        </button>
      `).join('')}
    </div>
  `;

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('.more-popup-item');
    if (!btn) return;
    toggleMorePopup(false);
    gotoPage(btn.dataset.page);
  });
}

function toggleMorePopup(show) {
  const overlay = document.getElementById('mobile-more-overlay');
  const popup = document.getElementById('mobile-more-popup');
  if (!overlay || !popup) return;
  overlay.classList.toggle('show', show);
  popup.classList.toggle('show', show);
  document.body.style.overflow = show ? 'hidden' : '';
}

function updateTabBarActive(page) {
  document.querySelectorAll('.tabbar-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === page);
  });
}

function initMobileUI() {
  renderMobileTabBar();
  renderMobileMorePopup();

  const overlay = document.getElementById('mobile-more-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => toggleMorePopup(false));
  }
}

function init() {
  renderMenu();
  showUser();
  loadSiteLogo();
  // 先创建 tab bar 骨架（更多菜单在 restoreSession 后填充）
  initMobileUI();
  // 先检查是否有token，如果有就先隐藏登录页面，避免闪烁
  const savedToken = localStorage.getItem('it_ledger_token');
  if (savedToken) {
    document.getElementById('app-shell').hidden = false;
    document.getElementById('app-shell').style.display = 'grid';
    document.getElementById('login-page').hidden = true;
    document.getElementById('login-page').style.display = 'none';
  }
  restoreSession()
    .then(() => {
      // 用户数据就绪后重新渲染更多菜单
      renderMobileMorePopup();
      const currentPage = localStorage.getItem('it_ledger_current_page') || 'dashboard';
      gotoPage(currentPage);
    })
    .catch(() => showLogin());
}

init();
