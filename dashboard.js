/**
 * ================================================================
 *  🔥 NEXUS EARN – MASTER DASHBOARD JAVASCRIPT (FIXED REDIRECT LOOP)
 *  ================================================================
 *  File: dashboard.js
 *  Description: Complete dashboard logic. Redirects to info.html
 *  only once per session, using a localStorage flag.
 *  ================================================================
 */

(function() {
    'use strict';

    // ================================================================
    //  SECTION 1: FIREBASE CONFIGURATION & INITIALISATION
    //  ================================================================

    const firebaseConfig = {
        apiKey: "AIzaSyDUIQ5s-MI2V3rsi_uWBbRb5YGcFmjjKK4",
        authDomain: "nexus-earn-1.firebaseapp.com",
        projectId: "nexus-earn-1",
        storageBucket: "nexus-earn-1.firebasestorage.app",
        messagingSenderId: "779765076952",
        appId: "1:779765076952:web:fa5fac51bef82e74b598ad"
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log('🔥 Firebase initialised successfully.');
    }

    const auth = firebase.auth();
    const db = firebase.firestore();
    const FieldValue = firebase.firestore.FieldValue;

    // ================================================================
    //  SECTION 2: GLOBAL STATE
    //  ================================================================

    let activeUserSession = null;
    let localUserRecord = null;
    let dbSnapshotUnsubscriber = null;
    let settingsUnsubscriber = null;
    let isClaiming = false;

    let adminSettings = {
        maintenanceMode: false,
        disabledVIPs: [],
        apkDownloadUrl: '',
        apkVersion: '1.0.0',
        referralCommissionRate: 10,
        checkinBonus: 50,
        dailyDeduction: 0,
        defaultContractDays: 365
    };

    const MILESTONES = [
        { target: 100000, reward: 5000, label: '100K' },
        { target: 200000, reward: 10000, label: '200K' },
        { target: 300000, reward: 15000, label: '300K' },
        { target: 400000, reward: 20000, label: '400K' },
        { target: 500000, reward: 25000, label: '500K' },
        { target: 600000, reward: 30000, label: '600K' },
        { target: 700000, reward: 35000, label: '700K' },
        { target: 800000, reward: 40000, label: '800K' },
        { target: 900000, reward: 45000, label: '900K' },
        { target: 1000000, reward: 50000, label: '1M' }
    ];

    let reminderShownThisSession = false;

    // ================================================================
    //  SECTION 3: UTILITY FUNCTIONS
    //  ================================================================

    function getNigeriaDate() {
        const now = new Date();
        const nigeriaTime = new Date(now.getTime() + 3600000);
        return nigeriaTime.toISOString().split('T')[0];
    }

    function getTierValue(tierCode) {
        const tiers = {
            VIP1: 1, VIP2: 2, VIP3: 3, VIP4: 4, VIP5: 5,
            VIP6: 6, VIP7: 7, VIP8: 8, VIP9: 9, VIP10: 10,
            VIP11: 11, VIP12: 12, VIP13: 13
        };
        return tiers[tierCode] || 0;
    }

    function getDailyYieldByTier(tierCode) {
        const yields = {
            VIP1: 500, VIP2: 1000, VIP3: 2000, VIP4: 4000, VIP5: 8000,
            VIP6: 16000, VIP7: 32000, VIP8: 64000, VIP9: 128000,
            VIP10: 256000, VIP11: 512000, VIP12: 1024000, VIP13: 2048000
        };
        return yields[tierCode] || 0;
    }

    function getPlanCost(tierCode) {
        const costs = {
            VIP1: 15500, VIP2: 30500, VIP3: 60000, VIP4: 120000, VIP5: 240000,
            VIP6: 480000, VIP7: 960000, VIP8: 1920000, VIP9: 3840000,
            VIP10: 7680000, VIP11: 15360000, VIP12: 30720000, VIP13: 61440000
        };
        return costs[tierCode] || 0;
    }

    function getPlanDays() { return 365; }

    // ================================================================
    //  SECTION 4: UI HELPERS (Toast, Modals, Loader, Dark Mode)
    //  ================================================================

    function showToast(message, isSuccess = true) {
        const toast = document.getElementById('customToast');
        const icon = document.getElementById('toastIcon');
        const text = document.getElementById('toastMsg');
        if (!toast) return;
        text.innerText = message;
        icon.className = isSuccess ? 'fa-solid fa-circle-check' : 'fa-solid fa-triangle-exclamation';
        icon.style.color = isSuccess ? '#10b981' : '#ef4444';
        toast.classList.add('show');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('show'), 3500);
    }

    function hideLoadingAndShow() {
        const loader = document.getElementById('loadingOverlay');
        if (loader) {
            loader.classList.add('hide');
            setTimeout(() => { loader.style.display = 'none'; }, 400);
        }
    }

    window.openPortalModal = function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'flex';
    };

    window.closePortalModal = function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    };

    window.switchPortalTab = function(view) {
        document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active-view'));
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active-tab'));

        const viewEl = document.getElementById('view' + view);
        const tabEl = document.getElementById('tab' + view);
        if (viewEl) viewEl.classList.add('active-view');
        if (tabEl) tabEl.classList.add('active-tab');

        if (view === 'Home') {
            setTimeout(() => {
                if (document.getElementById('viewHome').classList.contains('active-view')) {
                    showReminderModalOnce();
                }
            }, 300);
        }
    };

    function showReminderModalOnce() {
        if (!reminderShownThisSession) {
            reminderShownThisSession = true;
            window.openPortalModal('reminderModal');
        }
    }

    function initDarkMode() {
        const toggle = document.getElementById('darkModeToggle');
        if (!toggle) return;
        const saved = localStorage.getItem('nexusTheme');
        const body = document.body;
        if (saved === 'light') {
            body.classList.add('light-mode');
            toggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            body.classList.remove('light-mode');
            toggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
        toggle.addEventListener('click', function() {
            const isLight = body.classList.toggle('light-mode');
            if (isLight) {
                toggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
                localStorage.setItem('nexusTheme', 'light');
            } else {
                toggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
                localStorage.setItem('nexusTheme', 'dark');
            }
        });
    }

    function startMidnightCountdownTracker() {
        setInterval(() => {
            const now = new Date();
            const midnightTarget = new Date();
            midnightTarget.setHours(24, 0, 0, 0);
            const diff = midnightTarget - now;
            let h = Math.floor(diff / (1000 * 60 * 60));
            let m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            let s = Math.floor((diff % (1000 * 60)) / 1000);
            h = h < 10 ? '0' + h : h;
            m = m < 10 ? '0' + m : m;
            s = s < 10 ? '0' + s : s;
            const countdownEl = document.getElementById('countdownDisplay');
            if (countdownEl) countdownEl.innerText = h + ':' + m + ':' + s;
            const clockEl = document.getElementById('topSystemClock');
            if (clockEl) {
                clockEl.innerHTML = '<i class="fa-regular fa-clock"></i> ' +
                    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            }
        }, 1000);
    }

    function copyTextToClipboard(text, successMsg = 'Copied!') {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => showToast(successMsg))
                .catch(() => fallbackCopyText(text, successMsg));
        } else {
            fallbackCopyText(text, successMsg);
        }
    }

    function fallbackCopyText(text, successMsg) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showToast(successMsg);
        } catch (e) {
            showToast('Failed to copy. Please copy manually.', false);
        }
        document.body.removeChild(textarea);
    }

    // ================================================================
    //  SECTION 5: ADMIN SETTINGS
    //  ================================================================

    async function loadAdminSettings() {
        try {
            const settingsRef = db.collection('admin_settings').doc('platform_config');
            const docSnap = await settingsRef.get();
            if (docSnap.exists) {
                adminSettings = docSnap.data();
            } else {
                await settingsRef.set({
                    maintenanceMode: false,
                    disabledVIPs: [],
                    apkDownloadUrl: '',
                    apkVersion: '1.0.0',
                    dailyDeduction: 0,
                    defaultContractDays: 365,
                    referralCommissionRate: 10,
                    checkinBonus: 50
                });
                adminSettings = {
                    maintenanceMode: false,
                    disabledVIPs: [],
                    apkDownloadUrl: '',
                    apkVersion: '1.0.0',
                    referralCommissionRate: 10,
                    checkinBonus: 50
                };
            }
            updateApkButton();
            updateVIPDisabledState();
            updateClaimButtonState();
        } catch (err) {
            console.error('Error loading admin settings:', err);
        }
    }

    function listenToAdminSettings() {
        const settingsRef = db.collection('admin_settings').doc('platform_config');
        settingsUnsubscriber = settingsRef.onSnapshot((snapshot) => {
            if (snapshot.exists) {
                adminSettings = snapshot.data();
                updateApkButton();
                updateVIPDisabledState();
                updateClaimButtonState();
            }
        });
    }

    function updateApkButton() {
        const apkBtn = document.getElementById('apkDownloadBtn');
        if (!apkBtn) return;
        if (adminSettings.apkDownloadUrl && adminSettings.apkDownloadUrl !== '') {
            apkBtn.style.display = 'flex';
            const badge = document.getElementById('apkVersionBadge');
            if (badge) badge.innerText = adminSettings.apkVersion || '1.0.0';
            apkBtn.onclick = () => { window.open(adminSettings.apkDownloadUrl, '_blank'); };
        } else {
            apkBtn.style.display = 'none';
        }
    }

    function updateVIPDisabledState() {
        document.querySelectorAll('.upgrade-btn').forEach(btn => {
            const tier = btn.getAttribute('data-tier');
            if (adminSettings.disabledVIPs && adminSettings.disabledVIPs.includes(tier)) {
                btn.disabled = true;
                btn.title = 'This plan is currently disabled by admin';
                btn.style.opacity = '0.5';
                btn.textContent = '🔒 Unavailable';
            } else {
                btn.disabled = false;
                btn.title = '';
                btn.style.opacity = '1';
                btn.textContent = 'Activate Plan';
            }
        });
    }

    // ================================================================
    //  SECTION 6: CORE APPLICATION LOGIC
    //  ================================================================

    function updateClaimButtonState() {
        const claimBox = document.getElementById('universalTaskBox');
        const statusMsgDiv = document.getElementById('claimStatusMessage');
        if (!claimBox || !localUserRecord) return;

        const userTier = localUserRecord.tierCode || 'NONE';
        const todayStr = getNigeriaDate();
        const alreadyClaimed = localUserRecord.lastMiningClaimDate === todayStr;
        const daysRemaining = parseInt(localUserRecord.contractDaysRemaining || 0);

        claimBox.classList.remove('claim-available', 'claim-disabled', 'claim-maintenance', 'claim-completed', 'claim-loading');

        if (adminSettings.maintenanceMode) {
            claimBox.classList.add('claim-maintenance');
            claimBox.style.cursor = 'not-allowed';
            document.getElementById('taskIcon').className = 'fa-solid fa-tools';
            document.getElementById('taskStatusText').innerText = 'Maintenance';
            statusMsgDiv.style.display = 'block';
            statusMsgDiv.className = 'claim-status-message warning';
            statusMsgDiv.innerHTML = '<i class="fa-solid fa-shield-halved"></i> System maintenance in progress. Please try again later.';
            return;
        }

        if (userTier === 'NONE') {
            claimBox.classList.add('claim-disabled');
            claimBox.style.cursor = 'not-allowed';
            document.getElementById('taskIcon').className = 'fa-solid fa-lock';
            document.getElementById('taskStatusText').innerText = 'No Active Plan';
            statusMsgDiv.style.display = 'block';
            statusMsgDiv.className = 'claim-status-message error';
            statusMsgDiv.innerHTML = '<i class="fa-solid fa-crown"></i> Purchase a VIP plan to start earning daily!';
            return;
        }

        if (daysRemaining <= 0) {
            claimBox.classList.add('claim-disabled');
            claimBox.style.cursor = 'not-allowed';
            document.getElementById('taskIcon').className = 'fa-solid fa-calendar-times';
            document.getElementById('taskStatusText').innerText = 'Expired';
            statusMsgDiv.style.display = 'block';
            statusMsgDiv.className = 'claim-status-message error';
            statusMsgDiv.innerHTML = '<i class="fa-solid fa-hourglass-end"></i> Your 365‑day contract has expired. Purchase a new plan to continue earning.';
            return;
        }

        if (alreadyClaimed) {
            claimBox.classList.add('claim-completed');
            claimBox.style.cursor = 'default';
            document.getElementById('taskIcon').className = 'fa-solid fa-check-circle';
            document.getElementById('taskStatusText').innerText = 'Already Collected';
            statusMsgDiv.style.display = 'block';
            statusMsgDiv.className = 'claim-status-message success';
            statusMsgDiv.innerHTML = '<i class="fa-solid fa-check-double"></i> You\'ve already collected today\'s earnings. Come back tomorrow at midnight reset!';
            return;
        }

        claimBox.classList.add('claim-available');
        claimBox.style.cursor = 'pointer';
        document.getElementById('taskIcon').className = 'fa-solid fa-hand-holding-usd';
        document.getElementById('taskStatusText').innerText = 'Collect Income';
        statusMsgDiv.style.display = 'none';
    }

    function renderTerminalMetrics(data) {
        const currentBal = parseFloat(data.balance || 0);
        const userTier = data.tierCode || 'NONE';

        document.getElementById('displayUserBalance').innerText =
            '₦' + currentBal.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('displayTotalEarnings').innerText =
            '₦' + currentBal.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('displayActiveRank').innerText =
            userTier === 'NONE' ? 'STANDARD MEMBER' : userTier;

        document.getElementById('profileUsernameDisplay').innerText = data.username || 'Investor';
        document.getElementById('profileRankLabel').innerText =
            userTier === 'NONE' ? 'STANDARD MEMBER' : 'VIP TIER: ' + userTier;
        document.getElementById('taskPackageLabel').innerText =
            userTier === 'NONE' ? 'NONE (STANDARD)' : 'VIP TIER: ' + userTier;

        const displayYield = getDailyYieldByTier(userTier);
        document.getElementById('taskRewardLabel').innerHTML = '₦' + displayYield.toLocaleString();

        if (userTier !== 'NONE') {
            document.getElementById('premiumDaysTrackerRow').style.display = 'flex';
            const daysLeft = data.contractDaysRemaining !== undefined ? data.contractDaysRemaining : 365;
            document.getElementById('premiumDaysRemainingText').innerText = daysLeft + ' Days';
        } else {
            document.getElementById('premiumDaysTrackerRow').style.display = 'none';
        }

        const refCode = data.referralCode || data.username || 'nx79402';
        document.getElementById('inviteLinkText').innerText = 'https://nexus-earn.com/?ref=' + refCode;
        document.getElementById('teamRebateText').innerText = '₦' + (data.referralBonusEarned || 0).toLocaleString();
        document.getElementById('teamCapitalVolumeText').innerText = '₦' + (data.teamCapitalVolume || 0).toLocaleString();

        if (data.bankName && data.accountNumber && data.accountName) {
            document.getElementById('shrunkLabelBank').innerText = data.bankName;
            document.getElementById('shrunkLabelHolder').innerText = data.accountName;
            document.getElementById('shrunkLabelNumber').innerText = data.accountNumber;
            document.getElementById('bankFormFields').style.display = 'none';
            document.getElementById('bankBlockTitle').style.display = 'none';
            document.getElementById('shrunkBankDisplay').style.display = 'block';
            document.getElementById('bankEditWarningNote').style.display = 'block';
            document.getElementById('bankBindingBlock').style.borderColor = '#10b981';
        }

        if (data.createdAt) {
            const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            document.getElementById('profileRegDateDisplay').innerText =
                'Profile Registered: ' + date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        }
    }

    async function loadTeamBreakdownNetwork(userUID) {
        const container = document.getElementById('teamBreakdownContainer');
        if (!container) return;
        try {
            const teamQuery = db.collection('users').where('referredBy', '==', userUID);
            const snapshot = await teamQuery.get();
            const referredUsers = [];
            snapshot.forEach(doc => referredUsers.push({ uid: doc.id, ...doc.data() }));

            document.getElementById('teamSizeText').innerText = referredUsers.length + ' Users';
            let level2Count = 0;
            for (const ref of referredUsers) {
                const subQuery = db.collection('users').where('referredBy', '==', ref.uid);
                const subSnap = await subQuery.get();
                level2Count += subSnap.size;
            }
            document.getElementById('teamLvl2SizeText').innerText = level2Count + ' Users';

            if (referredUsers.length === 0) {
                container.innerHTML =
                    `<p style="font-size: 0.75rem; color: #9ca3af; text-align: center; padding: 10px;">No downline network links registered under this connection node.</p>`;
                return;
            }

            container.innerHTML = '';
            for (const member of referredUsers) {
                const row = document.createElement('div');
                row.className = 'user-breakdown-row';
                const displayName = member.username || 'Anonymous Invitee';
                const activeTier = member.tierCode && member.tierCode !== 'NONE' ? member.tierCode : null;
                const depositValue = parseFloat(member.totalDepositedAmount || 0);
                let badgeHtml = member.username ?
                    `<span class="status-badge registered">Registered</span>` :
                    `<span class="status-badge unregistered">Unregistered</span>`;
                if (activeTier) badgeHtml += `<span class="status-badge vip-tag">${activeTier}</span>`;
                else badgeHtml += `<span class="status-badge not-activated">Not Activated</span>`;
                row.innerHTML = `
                    <div class="user-meta-info">
                        <div class="user-display-name">${displayName}</div>
                        <div class="badge-holder">${badgeHtml}</div>
                    </div>
                    <div class="user-financial-contribution">
                        <span>Deposited</span>₦${depositValue.toLocaleString()}
                    </div>
                `;
                container.appendChild(row);
            }
        } catch (error) {
            console.error('Team breakdown error:', error);
            container.innerHTML =
                `<p style="font-size: 0.75rem; color: #ef4444; text-align: center; padding: 10px;">Error loading team. Please refresh.</p>`;
        }
    }

    function renderMilestones() {
        if (!localUserRecord) return;
        const container = document.getElementById('milestoneList');
        if (!container) return;
        const teamDepositTotal = parseFloat(localUserRecord.teamDepositTotal || 0);
        const claimedMilestones = localUserRecord.claimedMilestones || [];

        let html = '';
        for (const m of MILESTONES) {
            const reached = teamDepositTotal >= m.target;
            const alreadyClaimed = claimedMilestones.includes(m.target);
            let statusText = '',
                statusClass = '',
                buttonDisabled = true,
                buttonText = '';
            if (alreadyClaimed) {
                statusText = 'Claimed ✓';
                statusClass = 'status-claimed';
                buttonDisabled = true;
                buttonText = 'Claimed';
            } else if (reached) {
                statusText = 'Available!';
                statusClass = 'status-available';
                buttonDisabled = false;
                buttonText = `Claim ₦${m.reward.toLocaleString()}`;
            } else {
                statusText = 'Locked';
                statusClass = 'status-locked';
                buttonDisabled = true;
                buttonText = 'Locked';
            }
            html += `
                <div class="milestone-item">
                    <div class="milestone-info">
                        <div class="milestone-target">🎯 Total Referral Deposits: ₦${m.target.toLocaleString()}</div>
                        <div class="milestone-reward">🏆 Reward: ₦${m.reward.toLocaleString()}</div>
                    </div>
                    <div class="milestone-status ${statusClass}">${statusText}</div>
                    <button class="claim-milestone-btn" data-target="${m.target}" data-reward="${m.reward}" ${buttonDisabled ? 'disabled' : ''}>${buttonText}</button>
                </div>
            `;
        }
        container.innerHTML = html;
        document.querySelectorAll('.claim-milestone-btn').forEach(btn => {
            if (!btn.disabled) {
                btn.addEventListener('click', async (e) => {
                    const target = parseInt(btn.dataset.target, 10);
                    const reward = parseInt(btn.dataset.reward, 10);
                    await claimMilestoneReward(target, reward);
                });
            }
        });
    }

    async function claimMilestoneReward(target, reward) {
        if (!activeUserSession || !localUserRecord) {
            showToast('Please login first.', false);
            return;
        }
        const claimedMilestones = localUserRecord.claimedMilestones || [];
        if (claimedMilestones.includes(target)) {
            showToast('You have already claimed this milestone.', false);
            return;
        }
        const teamDepositTotal = parseFloat(localUserRecord.teamDepositTotal || 0);
        if (teamDepositTotal < target) {
            showToast(`You need total referral deposits of ₦${target.toLocaleString()} to claim this reward.`, false);
            return;
        }
        try {
            const userRef = db.collection('users').doc(activeUserSession.uid);
            await db.runTransaction(async (transaction) => {
                const snap = await transaction.get(userRef);
                const currentBalance = snap.data().balance || 0;
                const currentClaimed = snap.data().claimedMilestones || [];
                if (currentClaimed.includes(target)) throw new Error('Already claimed');
                transaction.update(userRef, {
                    balance: currentBalance + reward,
                    claimedMilestones: FieldValue.arrayUnion(target)
                });
            });
            await db.collection('ledger').add({
                uid: activeUserSession.uid,
                title: `🎯 Milestone Reward: ₦${target.toLocaleString()} Team Deposits`,
                amount: reward,
                type: 'credit',
                timestamp: FieldValue.serverTimestamp()
            });
            showToast(`🎉 You claimed ₦${reward.toLocaleString()} milestone reward!`);
            const userDoc = await db.collection('users').doc(activeUserSession.uid).get();
            if (userDoc.exists) {
                localUserRecord = userDoc.data();
                renderTerminalMetrics(localUserRecord);
                renderMilestones();
            }
        } catch (error) {
            console.error('Milestone claim error:', error);
            showToast('Failed to claim reward. Please try again.', false);
        }
    }

    async function runProductActivationCycle(packageName, packageCost, dailyYield, tierCode) {
        if (!activeUserSession || !localUserRecord) {
            showToast('Please login first.', false);
            return;
        }
        if (adminSettings.disabledVIPs && adminSettings.disabledVIPs.includes(tierCode)) {
            showToast('This VIP plan is currently disabled by admin. Please try another plan.', false);
            return;
        }
        const userRef = db.collection('users').doc(activeUserSession.uid);
        const currentTier = localUserRecord.tierCode || 'NONE';
        const currentTierValue = getTierValue(currentTier);
        const newTierValue = getTierValue(tierCode);
        if (currentTier !== 'NONE' && newTierValue <= currentTierValue) {
            showToast('You cannot downgrade your VIP level. Upgrade only.', false);
            return;
        }
        const currentBalance = parseFloat(localUserRecord.balance || 0);
        if (currentBalance < packageCost) {
            showToast(`Insufficient balance! You need ₦${packageCost.toLocaleString()}.`, false);
            return;
        }
        try {
            await db.runTransaction(async (transaction) => {
                const userSnapshot = await transaction.get(userRef);
                const walletBalance = parseFloat(userSnapshot.data().balance || 0);
                if (walletBalance < packageCost) throw new Error('INSUFFICIENT_FUNDS');
                transaction.update(userRef, {
                    balance: walletBalance - packageCost,
                    tierCode: tierCode,
                    contractDaysRemaining: 365,
                    activeDailyYield: dailyYield,
                    lastMiningClaimDate: ''
                });
            });
            await db.collection('ledger').add({
                uid: activeUserSession.uid,
                title: '🚀 Activated ' + packageName,
                amount: packageCost,
                type: 'debit',
                timestamp: FieldValue.serverTimestamp()
            });
            showToast(packageName + ' Plan Successfully Activated!');
            if (localUserRecord.referredBy) {
                triggerNetworkReferralReward(localUserRecord.referredBy, packageCost);
            }
            const updatedDoc = await userRef.get();
            if (updatedDoc.exists) {
                localUserRecord = updatedDoc.data();
                renderTerminalMetrics(localUserRecord);
                updateClaimButtonState();
            }
        } catch (error) {
            console.error('VIP activation error:', error);
            if (error.message === 'INSUFFICIENT_FUNDS') {
                showToast('Insufficient balance to activate this investment plan.', false);
            } else {
                showToast('Network error. Please try again.', false);
            }
        }
    }

    async function triggerNetworkReferralReward(referrerUID, purchasedPlanCost) {
        if (!referrerUID) return;
        const referrerRef = db.collection('users').doc(referrerUID);
        try {
            await db.runTransaction(async (transaction) => {
                const referrerSnap = await transaction.get(referrerRef);
                if (!referrerSnap.exists) return;
                const currentBalance = parseFloat(referrerSnap.data().balance || 0);
                const currentBonusEarned = parseFloat(referrerSnap.data().referralBonusEarned || 0);
                const directInvitesCount = parseInt(referrerSnap.data().directInvitesCount || 0);
                const oldTeamDepositTotal = parseFloat(referrerSnap.data().teamDepositTotal || 0);
                const teamCapitalVolume = parseFloat(referrerSnap.data().teamCapitalVolume || 0);
                const newTeamDepositTotal = oldTeamDepositTotal + purchasedPlanCost;
                const calculatedCommission = purchasedPlanCost * (adminSettings.referralCommissionRate || 10) / 100;
                const finalPayoutSum = calculatedCommission;
                transaction.update(referrerRef, {
                    balance: currentBalance + finalPayoutSum,
                    referralBonusEarned: currentBonusEarned + finalPayoutSum,
                    directInvitesCount: directInvitesCount + 1,
                    teamDepositTotal: newTeamDepositTotal,
                    teamCapitalVolume: teamCapitalVolume + purchasedPlanCost
                });
                await db.collection('ledger').add({
                    uid: referrerUID,
                    title: `🤝 ${adminSettings.referralCommissionRate || 10}% Direct Plan Referral Commission`,
                    amount: finalPayoutSum,
                    type: 'credit',
                    timestamp: FieldValue.serverTimestamp()
                });
            });
        } catch (error) {
            console.error('Referral reward error:', error);
        }
    }

    window.executeDailyMiningCycle = async function() {
        if (isClaiming) {
            showToast('Please wait, processing your previous claim...', false);
            return;
        }
        if (!activeUserSession || !localUserRecord) {
            showToast('Please login first.', false);
            return;
        }
        if (adminSettings.maintenanceMode) {
            showToast('System maintenance in progress. Please try again later.', false);
            return;
        }
        if (!localUserRecord.tierCode || localUserRecord.tierCode === 'NONE') {
            showToast('No active investment plan detected. Please purchase a VIP plan first.', false);
            return;
        }
        const todayStr = getNigeriaDate();
        if (localUserRecord.lastMiningClaimDate === todayStr) {
            showToast('Today\'s earnings already collected. Come back tomorrow at midnight reset.', false);
            return;
        }
        let daysRemaining = parseInt(localUserRecord.contractDaysRemaining || 0);
        if (daysRemaining <= 0) {
            const userRef = db.collection('users').doc(activeUserSession.uid);
            await userRef.update({ tierCode: 'NONE', contractDaysRemaining: 0, activeDailyYield: 0 });
            showToast('Your 365‑day investment contract has expired. Please purchase a new plan.', false);
            updateClaimButtonState();
            return;
        }
        const displayYield = getDailyYieldByTier(localUserRecord.tierCode);
        const finalEarning = Math.max(0, displayYield);
        isClaiming = true;
        const claimBox = document.getElementById('universalTaskBox');
        claimBox.classList.remove('claim-available');
        claimBox.classList.add('claim-loading');
        document.getElementById('taskIcon').className = 'fa-solid fa-spinner fa-pulse';
        document.getElementById('taskStatusText').innerText = 'Processing...';
        const userRef = db.collection('users').doc(activeUserSession.uid);
        try {
            await db.runTransaction(async (transaction) => {
                const snap = await transaction.get(userRef);
                const currentBalance = parseFloat(snap.data().balance || 0);
                let remaining = parseInt(snap.data().contractDaysRemaining || 0);
                let newRemaining = remaining - 1;
                if (newRemaining < 0) newRemaining = 0;
                transaction.update(userRef, {
                    balance: currentBalance + finalEarning,
                    lastMiningClaimDate: todayStr,
                    contractDaysRemaining: newRemaining
                });
            });
            await db.collection('ledger').add({
                uid: activeUserSession.uid,
                title: '💰 Daily Plan Returns',
                amount: finalEarning,
                type: 'credit',
                timestamp: FieldValue.serverTimestamp()
            });
            showToast('✅ Success! ₦' + finalEarning.toLocaleString() + ' added to your balance.');
            const updatedDoc = await userRef.get();
            if (updatedDoc.exists) {
                localUserRecord = updatedDoc.data();
                renderTerminalMetrics(localUserRecord);
                updateClaimButtonState();
            }
        } catch (error) {
            console.error('Daily claim error:', error);
            showToast('Database error. Please try again.', false);
            claimBox.classList.remove('claim-loading');
            claimBox.classList.add('claim-available');
            document.getElementById('taskIcon').className = 'fa-solid fa-hand-holding-usd';
            document.getElementById('taskStatusText').innerText = 'Collect Income';
        } finally {
            isClaiming = false;
            if (document.getElementById('taskIcon').className === 'fa-solid fa-spinner fa-pulse') {
                claimBox.classList.remove('claim-loading');
                updateClaimButtonState();
            }
        }
    };

    window.executeProfileAttendanceCheckIn = async function() {
        if (!activeUserSession || !localUserRecord) {
            showToast('Please login first.', false);
            return;
        }
        if (adminSettings.maintenanceMode) {
            showToast('System maintenance in progress. Check-in unavailable.', false);
            return;
        }
        if (!localUserRecord.tierCode || localUserRecord.tierCode === 'NONE') {
            showToast('Daily attendance rewards require an active plan level.', false);
            return;
        }
        const todayStr = getNigeriaDate();
        if (localUserRecord.lastAttendanceClaimDate === todayStr) {
            showToast('Attendance bonus already processed for today.', false);
            return;
        }
        const userRef = db.collection('users').doc(activeUserSession.uid);
        try {
            await db.runTransaction(async (transaction) => {
                const snap = await transaction.get(userRef);
                const currentBalance = parseFloat(snap.data().balance || 0);
                transaction.update(userRef, {
                    balance: currentBalance + (adminSettings.checkinBonus || 50),
                    lastAttendanceClaimDate: todayStr
                });
            });
            await db.collection('ledger').add({
                uid: activeUserSession.uid,
                title: '📅 Daily Attendance Check-In (+₦' + (adminSettings.checkinBonus || 50) + ')',
                amount: (adminSettings.checkinBonus || 50),
                type: 'credit',
                timestamp: FieldValue.serverTimestamp()
            });
            showToast('✅ Verified! ₦' + (adminSettings.checkinBonus || 50) + ' credited to your balance.');
            const updatedDoc = await userRef.get();
            if (updatedDoc.exists) {
                localUserRecord = updatedDoc.data();
                renderTerminalMetrics(localUserRecord);
            }
        } catch (error) {
            console.error('Check-in error:', error);
            showToast('Processing fault. Try reloading.', false);
        }
    };

    // ================================================================
    //  SECTION 7: BANK DETAILS
    //  ================================================================

    async function saveBankDetails() {
        if (!activeUserSession) return;
        const bank = document.getElementById('inputBankName').value;
        const holder = document.getElementById('inputBankHolderName').value.trim();
        const num = document.getElementById('inputBankNumber').value.trim();
        if (!bank || holder === '' || num.length !== 10) {
            window.closePortalModal('bankLockRulesPopup');
            showToast('Please provide an accurate 10‑digit account number configuration.', false);
            return;
        }
        window.closePortalModal('bankLockRulesPopup');
        try {
            const userRef = db.collection('users').doc(activeUserSession.uid);
            await userRef.update({ bankName: bank, accountName: holder, accountNumber: num });
            showToast('✅ Payout profile successfully linked and saved.');
            const updatedDoc = await userRef.get();
            if (updatedDoc.exists) {
                localUserRecord = updatedDoc.data();
                renderTerminalMetrics(localUserRecord);
            }
        } catch (error) {
            console.error('Bank save error:', error);
            showToast('An error occurred while locking your details. Please try again.', false);
        }
    }

    function copyReferralLink() {
        const textToCopy = document.getElementById('inviteLinkText').innerText;
        copyTextToClipboard(textToCopy, '📋 Referral tracking URL copied to clipboard!');
    }

    // ================================================================
    //  SECTION 8: VOUCHER SYSTEM
    //  ================================================================

    async function loadVoucherHistory() {
        if (!activeUserSession) return;
        try {
            const historyQuery = db.collection('voucherRedemptions').where('userId', '==', activeUserSession.uid);
            const snapshot = await historyQuery.get();
            const historySection = document.getElementById('voucherHistorySection');
            const historyList = document.getElementById('voucherHistoryList');
            if (!historySection || !historyList) return;
            if (snapshot.empty) {
                historySection.style.display = 'none';
                return;
            }
            const items = [];
            snapshot.forEach(docSnap => {
                const redemption = docSnap.data();
                const timestamp = redemption.timestamp?.toDate() || new Date(0);
                items.push({ redemption, timestamp });
            });
            items.sort((a, b) => b.timestamp - a.timestamp);
            const recent = items.slice(0, 5);
            historySection.style.display = 'block';
            historyList.innerHTML = '';
            for (const item of recent) {
                const redemption = item.redemption;
                const date = item.timestamp;
                const div = document.createElement('div');
                div.className = 'voucher-history-item';
                const voucherNameHtml = redemption.voucherName ? `<span class="voucher-name">(${redemption.voucherName})</span>` : '';
                div.innerHTML = `
                    <div>
                        <div class="voucher-history-code">${redemption.voucherCode}${voucherNameHtml}</div>
                        <div class="voucher-history-date">${date.toLocaleDateString()}</div>
                    </div>
                    <div class="voucher-history-amount">+₦${(redemption.amountClaimed || 0).toLocaleString()}</div>
                `;
                historyList.appendChild(div);
            }
        } catch (error) {
            console.error('Voucher history load error:', error);
        }
    }

    async function claimProgressiveVoucher(code) {
        if (!activeUserSession || !localUserRecord) {
            showToast('Please login first', false);
            return;
        }
        if (adminSettings.maintenanceMode) {
            showToast('System maintenance in progress. Voucher claims unavailable.', false);
            return;
        }
        if (!localUserRecord.tierCode || localUserRecord.tierCode === 'NONE') {
            showToast('VIP 1+ membership required to claim vouchers!', false);
            return;
        }
        const claimBtn = document.getElementById('claimVoucherBtn');
        const originalText = claimBtn.innerHTML;
        claimBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying...';
        claimBtn.disabled = true;
        try {
            const voucherQuery = db.collection('progressiveVouchers').where('code', '==', code);
            const voucherSnapshot = await voucherQuery.get();
            if (voucherSnapshot.empty) {
                showToast('❌ Invalid voucher code.', false);
                claimBtn.innerHTML = originalText;
                claimBtn.disabled = false;
                return;
            }
            const voucherDoc = voucherSnapshot.docs[0];
            const voucher = voucherDoc.data();
            if (!voucher.isActive || voucher.isFullyClaimed) {
                showToast('❌ This voucher has been fully claimed!', false);
                claimBtn.innerHTML = originalText;
                claimBtn.disabled = false;
                return;
            }
            if (voucher.expiry && voucher.expiry.toDate() < new Date()) {
                showToast('❌ This voucher has expired!', false);
                claimBtn.innerHTML = originalText;
                claimBtn.disabled = false;
                return;
            }
            if (voucher.claimedBy && voucher.claimedBy.includes(activeUserSession.uid)) {
                showToast('❌ You have already claimed this voucher!', false);
                claimBtn.innerHTML = originalText;
                claimBtn.disabled = false;
                return;
            }
            const currentIndex = voucher.currentClaimIndex || 0;
            const claimAmount = voucher.splitAmounts[currentIndex];
            if (!claimAmount || claimAmount <= 0) {
                showToast('❌ Voucher error - no remaining value', false);
                claimBtn.innerHTML = originalText;
                claimBtn.disabled = false;
                return;
            }
            const userRef = db.collection('users').doc(activeUserSession.uid);
            await db.runTransaction(async (transaction) => {
                const freshVoucher = await transaction.get(voucherDoc.ref);
                const freshData = freshVoucher.data();
                if (freshData.isFullyClaimed || freshData.remainingClaims <= 0) throw new Error('Voucher fully claimed');
                const userSnap = await transaction.get(userRef);
                const currentBalance = parseFloat(userSnap.data().balance || 0);
                transaction.update(userRef, { balance: currentBalance + claimAmount });
                const newRemainingClaims = freshData.remainingClaims - 1;
                const newRemainingAmount = freshData.remainingAmount - claimAmount;
                const newClaimIndex = freshData.currentClaimIndex + 1;
                const newClaimedBy = [...(freshData.claimedBy || []), activeUserSession.uid];
                const newClaimedAmounts = [...(freshData.claimedAmounts || []), claimAmount];
                transaction.update(voucherDoc.ref, {
                    remainingClaims: newRemainingClaims,
                    remainingAmount: newRemainingAmount,
                    currentClaimIndex: newClaimIndex,
                    claimedBy: newClaimedBy,
                    claimedAmounts: newClaimedAmounts,
                    isFullyClaimed: newRemainingClaims === 0
                });
            });
            await db.collection('voucherRedemptions').add({
                voucherCode: code,
                voucherName: voucher.name || 'Gift Card',
                userId: activeUserSession.uid,
                username: localUserRecord.username || 'User',
                userTier: localUserRecord.tierCode,
                amountClaimed: claimAmount,
                claimNumber: voucher.currentClaimIndex + 1,
                totalClaims: voucher.totalPeople,
                timestamp: FieldValue.serverTimestamp()
            });
            await db.collection('ledger').add({
                uid: activeUserSession.uid,
                title: `🎫 Voucher Claim: ${code} - ${voucher.name || 'Gift Card'}`,
                amount: claimAmount,
                type: 'credit',
                timestamp: FieldValue.serverTimestamp()
            });
            claimBtn.innerHTML = originalText;
            claimBtn.disabled = false;
            await Swal.fire({
                title: '🎉 Voucher Claimed!',
                html: `<div>
                    <div style="font-size:2rem;color:#10b981;">+₦${claimAmount.toLocaleString()}</div>
                    <div style="font-size:0.8rem;color:#e5b842;">${voucher.name || 'Gift Card'} - Claimant #${voucher.currentClaimIndex + 1} of ${voucher.totalPeople}</div>
                </div>`,
                icon: 'success',
                background: '#111424',
                color: '#fff',
                confirmButtonColor: '#e5b842',
                timer: 4000
            });
            document.getElementById('voucherCodeField').value = '';
            window.closePortalModal('couponModalPopup');
            await loadVoucherHistory();
            const updatedDoc = await userRef.get();
            if (updatedDoc.exists) {
                localUserRecord = updatedDoc.data();
                renderTerminalMetrics(localUserRecord);
            }
        } catch (error) {
            console.error('Voucher claim error:', error);
            showToast(error.message || 'Error processing voucher.', false);
            claimBtn.innerHTML = originalText;
            claimBtn.disabled = false;
        }
    }

    // ================================================================
    //  SECTION 9: APK ONE‑TIME DOWNLOAD
    //  ================================================================

    function initOneTimeApkButton() {
        const apkBtn = document.getElementById('oneTimeApkButton');
        if (!apkBtn) return;
        const alreadyInstalled = localStorage.getItem('nexus_apk_installed') === 'true';
        if (alreadyInstalled) {
            apkBtn.style.display = 'none';
            return;
        }
        apkBtn.style.display = 'flex';
        apkBtn.onclick = function(e) {
            e.stopPropagation();
            const link = document.createElement('a');
            link.href = 'nexus-earn.apk';
            link.download = 'nexus-earn.apk';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            localStorage.setItem('nexus_apk_installed', 'true');
            apkBtn.style.display = 'none';
            showToast('✅ Download started. Your app will be saved.', true);
        };
    }

    const originalOpenPortalModal = window.openPortalModal;
    window.openPortalModal = function(id) {
        originalOpenPortalModal(id);
        if (id === 'couponModalPopup') {
            initOneTimeApkButton();
        }
    };

    // ================================================================
    //  SECTION 10: LOGOUT
    //  ================================================================

    window.logout = async function() {
        const result = await Swal.fire({
            title: '⚠️ Confirm Logout',
            text: 'Are you sure you want to logout?',
            icon: 'question',
            background: '#111424',
            color: '#fff',
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#e5b842',
            confirmButtonText: 'Yes, Logout',
            cancelButtonText: 'Cancel',
            showCancelButton: true
        });
        if (result.isConfirmed) {
            await auth.signOut();
            await Swal.fire({
                title: '✅ Logged Out',
                text: 'Successfully logged out.',
                icon: 'success',
                background: '#111424',
                color: '#fff',
                confirmButtonColor: '#e5b842',
                timer: 2000
            });
            window.location.href = 'login.html';
        }
    };

    // ================================================================
    //  SECTION 11: EVENT LISTENERS
    //  ================================================================

    function bindEventListeners() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', window.logout);

        const saveBankBtn = document.getElementById('saveBankBtn');
        if (saveBankBtn) saveBankBtn.addEventListener('click', saveBankDetails);

        const copyLinkBtn = document.getElementById('copyLinkBtn');
        if (copyLinkBtn) copyLinkBtn.addEventListener('click', copyReferralLink);

        const claimVoucherBtn = document.getElementById('claimVoucherBtn');
        if (claimVoucherBtn) {
            claimVoucherBtn.addEventListener('click', async () => {
                if (!activeUserSession || !localUserRecord) {
                    showToast('Please login first', false);
                    return;
                }
                const codeInput = document.getElementById('voucherCodeField');
                const code = codeInput.value.trim().toUpperCase();
                if (!code) {
                    showToast('Please enter a voucher code', false);
                    codeInput.focus();
                    return;
                }
                await claimProgressiveVoucher(code);
            });
        }

        const claimBox = document.getElementById('universalTaskBox');
        if (claimBox) {
            claimBox.addEventListener('click', function(e) {
                if (isClaiming) return;
                if (this.classList.contains('claim-available')) {
                    window.executeDailyMiningCycle();
                } else if (!this.classList.contains('claim-loading')) {
                    if (adminSettings.maintenanceMode) {
                        showToast('System maintenance in progress. Please try again later.', false);
                    } else if (localUserRecord && (!localUserRecord.tierCode || localUserRecord.tierCode === 'NONE')) {
                        showToast('No active investment plan. Purchase a VIP plan to start earning.', false);
                    } else if (localUserRecord && localUserRecord.lastMiningClaimDate === getNigeriaDate()) {
                        showToast('You\'ve already collected today\'s earnings. Come back tomorrow!', false);
                    }
                }
            });
        }

        document.querySelectorAll('.upgrade-btn').forEach(button => {
            button.addEventListener('click', function() {
                const name = this.getAttribute('data-name');
                const cost = parseFloat(this.getAttribute('data-cost'));
                const yieldAmt = parseFloat(this.getAttribute('data-yield'));
                const tier = this.getAttribute('data-tier');
                runProductActivationCycle(name, cost, yieldAmt, tier);
            });
        });

        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const text = this.getAttribute('data-copy');
                if (text) copyTextToClipboard(text, 'Copied!');
            });
        });
    }

    // ================================================================
    //  SECTION 12: 🎯 REDIRECT TO INFO (ONCE PER SESSION – FIXED)
    //  ================================================================

    /**
     * Checks if we should redirect to info.html.
     * Only redirects if we are NOT on info.html AND the info page has NOT been shown before.
     * Uses localStorage flag 'nexusInfoShown' to remember.
     */
    function shouldRedirectToInfo() {
        const currentPath = window.location.pathname;
        const isOnInfoPage = currentPath.includes('info.html') || currentPath === '/' || currentPath === '';
        const infoShown = localStorage.getItem('nexusInfoShown') === 'true';
        return !isOnInfoPage && !infoShown;
    }

    // ================================================================
    //  SECTION 13: AUTHENTICATION & INIT
    //  ================================================================

    function initApp() {
        bindEventListeners();
        startMidnightCountdownTracker();
        initDarkMode();

        auth.onAuthStateChanged((user) => {
            if (user) {
                activeUserSession = user;
                console.log('👤 User authenticated:', user.uid);

                // 🎯 Redirect to info.html only once (fixed)
                if (shouldRedirectToInfo()) {
                    console.log('🔄 Redirecting to info page (first time)...');
                    localStorage.setItem('nexusInfoShown', 'true');
                    window.location.href = 'info.html?redirect=dashboard.html';
                    return;
                }

                // User is on dashboard (or info already shown) – proceed
                if (dbSnapshotUnsubscriber) {
                    dbSnapshotUnsubscriber();
                    dbSnapshotUnsubscriber = null;
                }

                const userDocRef = db.collection('users').doc(user.uid);
                dbSnapshotUnsubscriber = userDocRef.onSnapshot(async (snapshot) => {
                    if (snapshot.exists) {
                        localUserRecord = snapshot.data();
                        const updates = {};
                        if (localUserRecord.firstReferralBonusPaid !== undefined) {
                            updates.firstReferralBonusPaid = FieldValue.deleteField();
                        }
                        if (localUserRecord.extraReferral300 !== undefined) {
                            updates.extraReferral300 = FieldValue.deleteField();
                        }
                        if (Object.keys(updates).length > 0) {
                            await userDocRef.update(updates);
                            const refreshedSnap = await userDocRef.get();
                            if (refreshedSnap.exists) {
                                localUserRecord = refreshedSnap.data();
                            }
                        }
                        renderTerminalMetrics(localUserRecord);
                        loadTeamBreakdownNetwork(user.uid);
                        loadVoucherHistory();
                        renderMilestones();
                        updateClaimButtonState();
                        hideLoadingAndShow();
                        setTimeout(() => {
                            if (document.getElementById('viewHome').classList.contains('active-view')) {
                                showReminderModalOnce();
                            }
                        }, 500);
                    } else {
                        console.warn('User document does not exist. Redirecting to login.');
                        window.location.href = 'login.html';
                    }
                }, (error) => {
                    console.error('User document listener error:', error);
                    showToast('Error loading user data. Please refresh.', false);
                });

                loadAdminSettings();
                listenToAdminSettings();

            } else {
                console.log('🔒 No user authenticated. Redirecting to login.');
                window.location.href = 'login.html';
            }
        });
    }

    // ================================================================
    //  SECTION 14: START
    //  ================================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

    // Expose functions
    window.showToast = showToast;
    window.executeDailyMiningCycle = executeDailyMiningCycle;
    window.executeProfileAttendanceCheckIn = executeProfileAttendanceCheckIn;
    window.runProductActivationCycle = runProductActivationCycle;
    window.triggerNetworkReferralReward = triggerNetworkReferralReward;
    window.logout = logout;
    window.switchPortalTab = switchPortalTab;
    window.openPortalModal = openPortalModal;
    window.closePortalModal = closePortalModal;
    window.copyTextToClipboard = copyTextToClipboard;

    console.log('🚀 NEXUS EARN Dashboard JS loaded successfully.');
})();
