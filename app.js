/**
 * CAL // 365
 * Main Application Logic
 * Vanilla JS | No dependencies
 */

const LOCAL_STORAGE_KEY = 'cal_cases_data';
const THEME_STORAGE_KEY = 'cal_theme_pref';
const NOTES_STORAGE_KEY = 'cal_notes_data';
const RESET_HISTORY_KEY = 'cal_reset_history';
const URGES_DATA_KEY = 'cal_urges_data';
const ACHIEVEMENTS_KEY = 'cal_achievements';
const TRIGGERS_DATA_KEY = 'cal_triggers_data';
const MOOD_DATA_KEY = 'cal_moods_data';
const MILESTONE_CELEBRATED_KEY = 'cal_milestone_celebrated';
// App State Cache
let casesData = {};
let notesData = {};
let resetHistory = [];
let urgesData = {};
let triggersData = {};
let moodsData = {};
let achievements = { earned: [], earnedAt: {} };
let milestoneCelebrated = {};
let currentYear = new Date().getFullYear();
let notesSearchQuery = '';
let activeNotesTag = 'all';

// Batch Drag State
let isDragging = false;
let dragState = null; // 0, 1, or 2
let dragVisitedCount = 0;
let lastChangedDate = null;
let lastChangedState = null;
let dragFailDates = new Set();

// Determine today
const today = new Date();
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

// DOM Elements
const calendarGrid = document.getElementById('calendar-grid');
const streakVal = document.getElementById('streak-val');
const successVal = document.getElementById('success-val');
const failVal = document.getElementById('fail-val');
const currentYearTitle = document.getElementById('current-year');
const resetBtn = document.getElementById('reset-btn');
const bestStreakVal = document.getElementById('best-streak-val');

// New Stats Panel Elements
const statsCurrentYear = document.getElementById('stats-current-year');
const daysTrackedEl = document.getElementById('days-tracked');
const daysRemainingEl = document.getElementById('days-remaining');
const successRateEl = document.getElementById('success-rate');
const progressPctEl = document.getElementById('progress-pct');
const progressRingFill = document.getElementById('progress-ring-fill');

// Modal Elements
const noteModal = document.getElementById('note-modal');
const modalTitle = document.getElementById('modal-date-title');
const noteTextarea = document.getElementById('note-textarea');
const modalCloseBtn = document.getElementById('modal-x-close');
const modalSaveBtn = document.getElementById('modal-save-btn');
let activeNoteDate = null;

// Auto-Fill Modal Elements
const autofillModal = document.getElementById('autofill-modal');
const autofillHugeStat = document.getElementById('autofill-huge-stat');
const autofillTargetState = document.getElementById('autofill-target-state');
const autofillCancelBtn = document.getElementById('autofill-x-close');
const autofillConfirmBtn = document.getElementById('autofill-confirm-btn');
const autofillStatLabel = document.querySelector('.autofill-stat-label');

// Pending Auto-Fill State
let pendingAutofill = null; // { gapDates: [], newState: 1|2 }

// Mobile Menu
const statsPanel = document.querySelector('.stats-panel');

// Sparkline Canvas
const sparklineCanvas = document.getElementById('sparkline-canvas');
const ctx = sparklineCanvas ? sparklineCanvas.getContext('2d') : null;

// Sound Effects (Using extremely short simple generic browser beeps via AudioContext to avoid asset loading)
let audioCtx = null;
const playSound = (type) => {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        if (type === 'success') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
            oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1); // Slide up
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.1);
        } else if (type === 'fail') {
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.15);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.15);
        } else {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(300, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.05);
        }
    } catch(e) {}
    
    playHaptic(type);
};

const playHaptic = (pattern) => {
    if (!navigator.vibrate) return;
    if (pattern === 'success') navigator.vibrate(50);
    else if (pattern === 'fail') navigator.vibrate(30);
    else if (pattern === 'milestone') navigator.vibrate([30, 50, 30, 80, 30]);
    else if (pattern === 'badge') navigator.vibrate([20, 40, 20, 60, 20]);
    else if (pattern === 'light') navigator.vibrate(15);
    else if (pattern === 'medium') navigator.vibrate(30);
    else if (pattern === 'heavy') navigator.vibrate([40, 30, 40]);
    else if (typeof pattern === 'number') navigator.vibrate(pattern);
};

const showToast = (msg, type, duration) => {
    type = type || 'info';
    duration = duration || 3000;
    var container = document.getElementById('toast-container');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'toast-item toast-' + type;
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(function() {
        requestAnimationFrame(function() { el.classList.add('visible'); });
    });
    setTimeout(function() {
        el.classList.remove('visible');
        setTimeout(function() { el.remove(); }, 400);
    }, duration);
};

const updateYearProgress = () => {
    var yp = document.getElementById('yp-fill');
    var yt = document.getElementById('yp-text');
    if (!yp && !yt) return;
    var now = new Date();
    var start = new Date(currentYear, 0, 0);
    var diff = now - start;
    var dayOfYear = Math.floor(diff / 86400000);
    var totalDays = getDaysInYear(currentYear);
    var pct = Math.min(100, Math.round((dayOfYear / totalDays) * 100));
    if (yp) yp.style.width = pct + '%';
    if (yt) yt.textContent = pct + '%';
};

const scrollToCurrentMonth = () => {
    if (localStorage.getItem('cal_has_visited')) return;
    localStorage.setItem('cal_has_visited', 'true');
    var monthCards = document.querySelectorAll('.month-card');
    var target = monthCards[new Date().getMonth()];
    if (target) setTimeout(function() { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 600);
};

const animateStatsCounters = () => {
    var targets = document.querySelectorAll('.stats-panel .metric-value');
    targets.forEach(function(el) {
        var finalVal = parseInt(el.textContent) || 0;
        if (finalVal === 0) return;
        var original = finalVal;
        var duration = 700;
        var start = performance.now();
        var step = function(now) {
            var progress = Math.min((now - start) / duration, 1);
            var eased = 1 - Math.pow(1 - progress, 3);
            var current = Math.round(0 + (original - 0) * eased);
            el.textContent = current;
            if (progress < 1) requestAnimationFrame(step);
            else el.textContent = original;
        };
        requestAnimationFrame(step);
    });
};

const observeStatsSections = () => {
    var sections = document.querySelectorAll('.stats-panel .stats-section');
    if (!sections.length) return;
    var obs = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('stats-section-visible');
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });
    sections.forEach(function(s) { obs.observe(s); });
};
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];
const DAYS_OF_WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Helpers
const getDaysInMonth = (monthIndex, year) => {
    return new Date(year, monthIndex + 1, 0).getDate();
};

const getFirstDayOfMonth = (monthIndex, year) => {
    let day = new Date(year, monthIndex, 1).getDay();
    return day === 0 ? 6 : day - 1; 
};

/**
 * Theme Management
 */
const getThemeToggleLabel = (theme) => theme === 'light' ? 'Dark Mode' : 'Light Mode';

const syncThemeToggleLabels = (theme) => {
    const navThemeLabel = document.getElementById('nav-theme-label');
    if (navThemeLabel) {
        navThemeLabel.textContent = getThemeToggleLabel(theme);
    }
};

const loadTheme = () => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    syncThemeToggleLabels(savedTheme);
};

/**
 * Elite PWA: App Badging
 */
const updateAppBadge = () => {
    if ('setAppBadge' in navigator) {
        const stats = calculateStatsValues(); 
        if (stats.successCount > 0) {
            // Using successCount or streak? Let's use streak if available in stats
            // Actually, streak logic is in calculateStatsValues (I should verify the return fields).
            // Let's assume it returns a streak or I'll use successCount for simplicity as a badge.
            navigator.setAppBadge(stats.successCount).catch(() => {});
        } else {
            navigator.clearAppBadge().catch(() => {});
        }
    }
};

/**
 * Elite PWA: OS Interop & Resilience
 */
const setupPWAElite = () => {
    // 1. Connection Monitoring
    window.addEventListener('online', function() { showToast('ONLINE · Archive Sync Ready', 'success', 3000); });
    window.addEventListener('offline', function() { showToast('OFFLINE · Local Cache Active', 'info', 3000); });

    // 2. Window Controls Overlay (WCO)
    if ('windowControlsOverlay' in navigator) {
        const updateWCO = () => {
            const { visible } = navigator.windowControlsOverlay;
            const header = document.getElementById('desktop-nav');
            if (header) {
                if (visible) {
                    header.classList.add('wco-active');
                } else {
                    header.classList.remove('wco-active');
                }
            }
        };
        navigator.windowControlsOverlay.addEventListener('geometrychange', updateWCO);
        updateWCO();
    }

    // 3. Shortcut Actions
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (action === 'today') {
        const todayCell = document.querySelector('.day-cell.today');
        if (todayCell) setTimeout(() => todayCell.scrollIntoView({ behavior: 'smooth', block: 'center' }), 500);
    } else if (action === 'stats') {
        setTimeout(() => {
            if (statsPanel) {
                statsPanel.classList.add('active');
                refreshStatsPanel();
                document.body.style.overflow = 'hidden';
            }
        }, 500);
    }

    updateAppBadge();
};

const toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    syncThemeToggleLabels(newTheme);

    // Swap SVG icon between moon and sun
    const themeBtn = document.getElementById('nav-theme-toggle');
    if (themeBtn) {
        const svg = themeBtn.querySelector('svg');
        if (svg) {
            if (newTheme === 'light') {
                svg.innerHTML = '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
            } else {
                svg.innerHTML = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
            }
        }
    }
};

/**
 * INIT APP
 */
const init = () => {
    loadTheme();
    currentYearTitle.textContent = currentYear;
    document.title = 'The Daily Tracker // ' + currentYear;
    
    loadData();
    renderCalendar();
    updateStats();
    renderSidebarNotes();
    checkAndEarnBadges();
    attachEventListeners();
    
    // Initial render of stats panel sections
    renderMilestoneRings();
    renderPersonalRecords();
    renderMonthlyPurity();
    renderAchievementBadges();
    renderPatternInsights();
    renderMastheadDistribution();
    updateYearProgress();
    scrollToCurrentMonth();
    observeStatsSections();
    
    // Advanced PWA: Handle Shortcuts
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    if (action === 'log') {
        setTimeout(() => {
            const bnavNote = document.getElementById('bnav-note');
            if (bnavNote) bnavNote.click();
            else {
                // Desktop fallback: just open today note
                const todayCell = document.querySelector('.day-cell.today');
                if (todayCell) openNoteModal({ target: todayCell });
            }
        }, 500);
    } else if (action === 'stats') {
        setTimeout(() => {
            const bnavStats = document.getElementById('bnav-stats');
            if (bnavStats) bnavStats.click();
            else {
                const sp = document.querySelector('.stats-panel');
                if (sp) {
                    sp.classList.add('active');
                    refreshStatsPanel();
                    document.body.style.overflow = 'hidden';
                }
            }
        }, 500);
    }

    // Advanced PWA: Window Controls Overlay support
    if ('windowControlsOverlay' in navigator) {
        navigator.windowControlsOverlay.addEventListener('geometrychange', (e) => {
            // Force a slight layout refresh if needed
            console.log('WCO Geometry Change', e.visible);
        });
    }

    // Draw initial sparkline
    setTimeout(drawSparkline, 100);

    // Premium Onboarding Controller
    const setupOnboarding = () => {
        const overlay = document.getElementById('onboarding-overlay');
        const slides = document.querySelectorAll('.onboarding-slide');
        const nextBtns = document.querySelectorAll('.onboarding-next-btn');
        const startBtn = document.getElementById('onboarding-start-btn');
        const skipBtn = document.getElementById('onboarding-skip-btn');
        const dots = document.querySelectorAll('#onboarding-pagination .dot');
        
        let currentSlide = 0;

        const showSlide = (index) => {
            slides.forEach((s, i) => {
                s.classList.toggle('active', i === index);
            });
            dots.forEach((d, i) => {
                d.classList.toggle('active', i === index);
            });
            currentSlide = index;
        };

        const closeOnboarding = () => {
            if (overlay) {
                overlay.style.opacity = '0';
                overlay.style.pointerEvents = 'none';
                setTimeout(() => {
                    overlay.style.display = 'none';
                }, 1000);
            }
            localStorage.setItem('cal_onboarded_v1', 'true');
        };

        nextBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (currentSlide < slides.length - 1) {
                    showSlide(currentSlide + 1);
                }
            });
        });

        if (startBtn) startBtn.addEventListener('click', closeOnboarding);
        if (skipBtn) skipBtn.addEventListener('click', closeOnboarding);

        // Initial check for first-time entry
        const hasData = Object.keys(casesData).length > 0;
        const hasOnboarded = localStorage.getItem('cal_onboarded_v1');

        if (!hasData && !hasOnboarded) {
            if (overlay) {
                overlay.style.opacity = '1';
                overlay.style.pointerEvents = 'auto';
            }
        } else {
            if (overlay) {
                overlay.style.display = 'none';
            }
        }
    };

    setupOnboarding();
};

/**
 * Render Notes Sidebar (Desktop)
 */
const extractNoteTags = (text) => {
    const matches = text.match(/#[A-Za-z0-9_-]+/g) || [];
    const seen = new Set();

    return matches.filter((tag) => {
        const normalized = tag.toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
};

const getSortedNoteEntries = () => {
    return Object.entries(notesData)
        .filter(([_, val]) => val && val.trim())
        .sort((a, b) => b[0].localeCompare(a[0]));
};

const getFilteredNoteEntries = (noteEntries) => {
    const query = notesSearchQuery.trim().toLowerCase();

    return noteEntries.filter(([dateStr, text]) => {
        const tags = extractNoteTags(text);
        const matchesTag = activeNotesTag === 'all'
            || tags.some((tag) => tag.toLowerCase() === activeNotesTag);
        const matchesQuery = !query
            || text.toLowerCase().includes(query)
            || dateStr.includes(query)
            || tags.some((tag) => tag.toLowerCase().includes(query));

        return matchesTag && matchesQuery;
    });
};

const renderSidebarTagRail = (noteEntries) => {
    const tagRail = document.getElementById('sidebar-tag-rail');
    if (!tagRail) return;

    tagRail.innerHTML = '';


    const tagCounts = new Map();
    noteEntries.forEach(([_, text]) => {
        extractNoteTags(text).forEach((tag) => {
            const normalized = tag.toLowerCase();
            if (!tagCounts.has(normalized)) {
                tagCounts.set(normalized, { label: tag, count: 0 });
            }
            tagCounts.get(normalized).count += 1;
        });
    });

    [...tagCounts.entries()]
        .sort((a, b) => b[1].count - a[1].count || a[1].label.localeCompare(b[1].label))
        .slice(0, 12)
        .forEach(([normalized, meta]) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'sidebar-tag-chip' + (activeNotesTag === normalized ? ' active' : '');
            chip.textContent = `${meta.label} · ${meta.count}`;
            chip.dataset.tag = normalized;
            tagRail.appendChild(chip);
        });
};

const renderSidebarNotes = () => {
    const list = document.getElementById('sidebar-notes-list');
    const empty = document.getElementById('sidebar-empty');
    const searchInput = document.getElementById('sidebar-search');
    const clearBtn = document.getElementById('sidebar-clear-filters');
    if (!list || !empty) return;
    
    list.innerHTML = '';

    if (searchInput && searchInput.value !== notesSearchQuery) {
        searchInput.value = notesSearchQuery;
    }
    
    const noteEntries = getSortedNoteEntries();
    const filteredEntries = getFilteredNoteEntries(noteEntries);
    const hasActiveFilter = notesSearchQuery.trim() || activeNotesTag !== 'all';

    renderSidebarTagRail(noteEntries);


    if (clearBtn) {
        clearBtn.style.visibility = hasActiveFilter ? 'visible' : 'hidden';
    }
    
    if (noteEntries.length === 0) {
        empty.innerHTML = `
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                <circle cx="12" cy="12" r="2" opacity="0.3"/>
            </svg>
            <p>No inscriptions yet.</p>
            <p class="sidebar-hint">Double-tap any day to leave a thought</p>
        `;
        empty.style.display = 'flex';
        return;
    }

    if (filteredEntries.length === 0) {
        empty.innerHTML = `
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.3-4.3"/>
                <line x1="11" y1="8" x2="11" y2="14"/>
                <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            <p>No notes match &ldquo;${notesSearchQuery || activeNotesTag}&rdquo;</p>
            <p class="sidebar-hint">Try a different filter or clear the active tag</p>
        `;
        empty.style.display = 'flex';
        return;
    }
    
    empty.style.display = 'none';
    
    filteredEntries.forEach(([dateStr, text]) => {
        const card = document.createElement('div');
        card.className = 'sidebar-note-card';
        
        const dateParts = dateStr.split('-');
        const monthName = MONTHS[parseInt(dateParts[1]) - 1];
        const dayNum = parseInt(dateParts[2]);
        
        const dateEl = document.createElement('div');
        dateEl.className = 'sidebar-note-date';
        dateEl.textContent = monthName + ' ' + dayNum;
        
        const textEl = document.createElement('div');
        textEl.className = 'sidebar-note-text';
        textEl.textContent = text;
        
        const tags = extractNoteTags(text);

        card.appendChild(dateEl);
        card.appendChild(textEl);

        if (tags.length > 0) {
            const tagList = document.createElement('div');
            tagList.className = 'sidebar-note-tags';

            tags.forEach((tag) => {
                const tagEl = document.createElement('span');
                tagEl.className = 'sidebar-note-tag';
                tagEl.textContent = tag;
                tagList.appendChild(tagEl);
            });

            card.appendChild(tagList);
        }
        
        // Click to scroll to that day and open edit
        card.addEventListener('click', () => {
            const cell = document.querySelector('.day-cell[data-date="' + dateStr + '"]');
            if (cell) {
                cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setTimeout(() => openNoteModal({ target: cell }), 400);
            }
        });
        
        list.appendChild(card);
    });
};

/**
 * Local Storage Management
 */
const loadData = () => {
    const savedCases = localStorage.getItem(LOCAL_STORAGE_KEY);
    const savedNotes = localStorage.getItem(NOTES_STORAGE_KEY);
    const savedResetHistory = localStorage.getItem(RESET_HISTORY_KEY);
    const savedUrges = localStorage.getItem(URGES_DATA_KEY);
    const savedAchievements = localStorage.getItem(ACHIEVEMENTS_KEY);
    const savedTriggers = localStorage.getItem(TRIGGERS_DATA_KEY);
    const savedMoods = localStorage.getItem(MOOD_DATA_KEY);
    const savedMilestoneCelebrated = localStorage.getItem(MILESTONE_CELEBRATED_KEY);
    
    if (savedCases) {
        try { casesData = JSON.parse(savedCases); } catch (e) { casesData = {}; }
    } else { casesData = {}; }

    if (savedNotes) {
        try { notesData = JSON.parse(savedNotes); } catch (e) { notesData = {}; }
    } else { notesData = {}; }

    if (savedResetHistory) {
        try { resetHistory = JSON.parse(savedResetHistory); } catch (e) { resetHistory = []; }
    } else { resetHistory = []; }

    if (savedUrges) {
        try { urgesData = JSON.parse(savedUrges); } catch (e) { urgesData = {}; }
    } else { urgesData = {}; }

    if (savedTriggers) {
        try { triggersData = JSON.parse(savedTriggers); } catch (e) { triggersData = {}; }
    } else { triggersData = {}; }

    if (savedMoods) {
        try { moodsData = JSON.parse(savedMoods); } catch (e) { moodsData = {}; }
    } else { moodsData = {}; }

    if (savedAchievements) {
        try { achievements = JSON.parse(savedAchievements); } catch (e) { achievements = { earned: [], earnedAt: {} }; }
    } else { achievements = { earned: [], earnedAt: {} }; }

    if (savedMilestoneCelebrated) {
        try { milestoneCelebrated = JSON.parse(savedMilestoneCelebrated); } catch (e) { milestoneCelebrated = {}; }
    }

};

const checkMilestoneCelebration = () => {
    const todayData = casesData[todayStr];
    if (todayData !== 1) return;
    let streak = 0;
    let d = new Date();
    d.setHours(0,0,0,0);
    while (true) {
        const ds = formatDateStr(d);
        if (casesData[ds] === 1) {
            streak++;
            d.setDate(d.getDate() - 1);
        } else break;
    }
    const milestones = [7, 14, 30, 60, 90, 100, 365];
    if (milestones.includes(streak)) {
        playHaptic('milestone');
        showToast((MILESTONES[streak] || streak + ' days') + ' · STREAK MILESTONE', 'accent', 3200);
    }
};

const saveData = () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(casesData));
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notesData));
    localStorage.setItem(RESET_HISTORY_KEY, JSON.stringify(resetHistory));
    localStorage.setItem(URGES_DATA_KEY, JSON.stringify(urgesData));
    localStorage.setItem(TRIGGERS_DATA_KEY, JSON.stringify(triggersData));
    localStorage.setItem(MOOD_DATA_KEY, JSON.stringify(moodsData));
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(achievements));
    localStorage.setItem(MILESTONE_CELEBRATED_KEY, JSON.stringify(milestoneCelebrated));
    updateStats();
    drawSparkline();
    renderCalendar();
    updateAppBadge();
    renderSidebarNotes();
    checkMilestoneCelebration();
    checkAndEarnBadges();
    renderMilestoneRings();
    renderPersonalRecords();
    renderMonthlyPurity();
    renderAchievementBadges();
    renderPatternInsights();
    renderMastheadDistribution();
    updateYearProgress();
};

/**
 * NATIVE SHARE API
 */
// Removed dead shareProgress block

const calculateStatsValues = () => {
    let successCount = 0;
    let totalInputs = 0; 
    
    for (const date in casesData) {
        if (casesData[date] === 1) successCount++;
        if (casesData[date] === 1 || casesData[date] === 2) totalInputs++;
    }
    
    let currentStreak = 0;
    let checkDate = new Date();
    checkDate.setHours(0,0,0,0);
    let streakActive = true;
    while(streakActive) {
        const dStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        const state = casesData[dStr];
        if (dStr === todayStr && !state) { checkDate.setDate(checkDate.getDate() - 1); continue; }
        if (state === 1) { currentStreak++; checkDate.setDate(checkDate.getDate() - 1); }
        else { streakActive = false; }
        if (checkDate.getFullYear() < currentYear) streakActive = false;
    }
    return { successCount, currentStreak, totalInputs }; 
};

/**
 * Canvas Poster Generation
 */
const exportPoster = (options = {}) => {
    const config = {
        theme: options.theme || 'archival',
        layout: options.layout || 'standard',
        format: options.format || 'png',
        title: options.title || '',
        includeStats: options.includeStats !== false,
        includeNotes: options.includeNotes !== false,
        includeLegend: options.includeLegend !== false,
        includeUrges: options.includeUrges !== false,
        includeMood: options.includeMood !== false
    };

    const dims = {
        standard: { w: 2480, h: 3508 },
        square: { w: 2400, h: 2400 },
        story: { w: 1080, h: 1920 },
        landscape: { w: 3200, h: 1800 }
    };

    const { w, h } = dims[config.layout] || dims.standard;
    const monthCols = config.layout === 'landscape' ? 4 : config.layout === 'story' ? 2 : config.layout === 'square' ? 2 : 3;

    const themes = {
        archival: { bg: '#0F0D0B', text: '#EAE6DF', dim: '#88837C', border: '#2F2E2C', success: '#205E41', fail: '#B84A4A', neutral: '#242220', muted: '#1A1816' },
        gallery: { bg: '#F8F6F1', text: '#1A1A1A', dim: '#999999', border: '#E4E0D8', success: '#217346', fail: '#A4262C', neutral: '#E4E0D8', muted: '#EEECE6' },
        solstice: { bg: '#163020', text: '#D4AF37', dim: '#8F9779', border: '#2D4B37', success: '#D4AF37', fail: '#C0392B', neutral: '#1F402B', muted: '#1A3625' },
        midnight: { bg: '#0B1120', text: '#C8D0E0', dim: '#607090', border: '#1E2A40', success: '#2E7D5E', fail: '#B84A4A', neutral: '#141C30', muted: '#0F1628' },
        dawn: { bg: '#F5E8D8', text: '#2C2418', dim: '#A09080', border: '#E0D0BC', success: '#6B8F5E', fail: '#C05540', neutral: '#E8DCCC', muted: '#EDE0D0' },
        noir: { bg: '#0A0A0A', text: '#E8E8E8', dim: '#707070', border: '#1E1E1E', success: '#FFFFFF', fail: '#555555', neutral: '#181818', muted: '#101010' }
    };

    const t = themes[config.theme] || themes.archival;
    const s = (px) => Math.round(px * Math.min(w / 2480, h / 3508));
    const mimeType = config.format === 'jpeg' ? 'image/jpeg' : config.format === 'webp' ? 'image/webp' : 'image/png';
    const ext = config.format === 'jpeg' ? 'jpg' : config.format;

    const pCanvas = document.getElementById('poster-canvas');
    if (!pCanvas) return;
    pCanvas.width = w;
    pCanvas.height = h;
    const pCtx = pCanvas.getContext('2d');

    pCtx.fillStyle = t.bg;
    pCtx.fillRect(0, 0, w, h);

    const nSize = s(100);
    const nCv = document.createElement('canvas');
    nCv.width = nSize; nCv.height = nSize;
    const nCt = nCv.getContext('2d');
    const nAlpha = config.theme === 'gallery' || config.theme === 'dawn' ? 0.02 : 0.03;
    const nCol = config.theme === 'gallery' || config.theme === 'dawn' ? '0,0,0' : '255,255,255';
    for (let i = 0; i < nSize; i++) {
        for (let j = 0; j < nSize; j++) {
            if (Math.random() > 0.95) {
                nCt.fillStyle = 'rgba(' + nCol + ',' + nAlpha + ')';
                nCt.fillRect(i, j, 1, 1);
            }
        }
    }
    const np = pCtx.createPattern(nCv, 'repeat');
    pCtx.fillStyle = np;
    pCtx.fillRect(0, 0, w, h);

    const marginX = s(200);
    let cursorY = s(300);

    pCtx.font = '500 ' + s(28) + 'px "Work Sans", sans-serif';
    pCtx.fillStyle = t.dim;
    pCtx.fillText('A DAILY RECORD', marginX, cursorY);
    cursorY += s(80);

    pCtx.font = 'italic 400 ' + s(80) + 'px "Fraunces", serif';
    pCtx.fillStyle = t.dim;
    pCtx.fillText('NO.', marginX, cursorY);
    pCtx.font = '400 ' + s(260) + 'px "Fraunces", serif';
    pCtx.fillStyle = t.text;
    pCtx.fillText(currentYear.toString(), marginX + s(180), cursorY + s(20));

    if (config.title) {
        cursorY += s(80);
        pCtx.font = '300 ' + s(32) + 'px "Work Sans", sans-serif';
        pCtx.fillStyle = t.dim;
        pCtx.fillText(config.title.toUpperCase(), marginX, cursorY);
    }

    cursorY += s(60);
    pCtx.beginPath();
    pCtx.moveTo(marginX, cursorY);
    pCtx.lineTo(w - marginX, cursorY);
    pCtx.strokeStyle = t.border;
    pCtx.lineWidth = s(2);
    pCtx.stroke();
    cursorY += s(100);

    const colGap = s(config.layout === 'landscape' ? 60 : 100);
    const colW = (w - (marginX * 2) - (colGap * (monthCols - 1))) / monthCols;
    const cellW = colW / 7;
    const rad = cellW * 0.35;
    const dowN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    MONTHS.forEach((mn, mi) => {
        const r = Math.floor(mi / monthCols);
        const c = mi % monthCols;
        const bx = marginX + (c * (colW + colGap));
        const by = cursorY + (r * (cellW * 8 + s(100)));

        pCtx.font = 'italic 400 ' + s(56) + 'px "Fraunces", serif';
        pCtx.fillStyle = t.text;
        pCtx.fillText(mn, bx, by);

        const ar = 'ARC ' + String(mi + 1).padStart(2, '0');
        pCtx.font = '400 ' + s(16) + 'px "Fragment Mono", monospace';
        pCtx.fillStyle = t.dim;
        pCtx.textAlign = 'right';
        pCtx.fillText(ar, bx + colW, by);
        pCtx.textAlign = 'left';

        const gy = by + s(40);
        pCtx.font = '500 ' + s(15) + 'px "Work Sans", sans-serif';
        pCtx.fillStyle = t.dim;
        pCtx.textAlign = 'center';
        pCtx.textBaseline = 'middle';
        for (let d = 0; d < 7; d++) {
            pCtx.fillText(dowN[d], bx + (d + 0.5) * cellW, gy + s(10));
        }

        const dim = new Date(currentYear, mi + 1, 0).getDate();
        const fd = getFirstDayOfMonth(mi, currentYear);
        const dSy = gy + s(30);

        for (let i = 0; i < 42; i++) {
            const gr = Math.floor(i / 7);
            const gc = i % 7;
            const cx = bx + (gc + 0.5) * cellW;
            const cy = dSy + (gr + 0.5) * cellW;
            if (i >= fd && i < fd + dim) {
                const dn = i - fd + 1;
                const ds = currentYear + '-' + String(mi + 1).padStart(2, '0') + '-' + String(dn).padStart(2, '0');
                const st = casesData[ds] || 0;

                pCtx.beginPath();
                pCtx.arc(cx, cy, rad, 0, Math.PI * 2);
                pCtx.fillStyle = st === 1 ? t.success : st === 2 ? t.fail : t.neutral;
                pCtx.fill();

                if (ds === todayStr) {
                    pCtx.beginPath();
                    pCtx.arc(cx, cy, rad + s(3), 0, Math.PI * 2);
                    pCtx.strokeStyle = st === 1 || st === 2 ? t.bg : t.text;
                    pCtx.lineWidth = s(2);
                    pCtx.stroke();
                }

                pCtx.fillStyle = (st === 1 || st === 2) ? t.bg : t.text;
                pCtx.font = '500 ' + s(18) + 'px "Work Sans", sans-serif';
                pCtx.textAlign = 'center';
                pCtx.textBaseline = 'middle';
                pCtx.fillText(dn.toString(), cx, cy);

                if (config.includeNotes && notesData[ds]) {
                    pCtx.beginPath();
                    pCtx.arc(cx + rad - s(4), cy - rad + s(4), s(3), 0, Math.PI * 2);
                    pCtx.fillStyle = t.dim;
                    pCtx.fill();
                }
            }
        }
    });
    pCtx.textAlign = 'left';
    pCtx.textBaseline = 'alphabetic';

    let statsY = h - s(320);

    if (config.includeLegend) {
        let lx = marginX;
        pCtx.font = '500 ' + s(16) + 'px "Fragment Mono", monospace';
        pCtx.fillStyle = t.dim;
        pCtx.fillText('LEGEND', lx, statsY);
        lx += s(100);
        [
            ['CLEAN', t.success],
            ['RELAPSE', t.fail],
            ['UNMARKED', t.neutral]
        ].forEach(function(it) {
            pCtx.beginPath();
            pCtx.arc(lx, statsY - s(6), s(8), 0, Math.PI * 2);
            pCtx.fillStyle = it[1];
            pCtx.fill();
            pCtx.fillStyle = t.text;
            pCtx.font = '600 ' + s(15) + 'px "Work Sans", sans-serif';
            pCtx.fillText(it[0], lx + s(14), statsY);
            lx += s(150);
        });
    }

    if (config.includeStats) {
        const sv = calculateStatsValues();
        const sx = w - marginX - s(500);
        pCtx.font = 'italic 400 ' + s(48) + 'px "Fraunces", serif';
        pCtx.fillStyle = t.text;
        pCtx.fillText(sv.currentStreak + ' DAYS', sx, statsY);
        statsY += s(50);
        pCtx.font = '400 ' + s(18) + 'px "Work Sans", sans-serif';
        pCtx.fillStyle = t.dim;
        const wr = sv.totalInputs > 0 ? (sv.successCount / sv.totalInputs * 100).toFixed(1) : '0.0';
        pCtx.fillText('CLEAN ' + sv.successCount + ' \u00B7 RELAPSE ' + (sv.totalInputs - sv.successCount) + ' \u00B7 ' + wr + '%', sx, statsY);
    }

    if (config.includeUrges) {
        statsY += s(50);
        pCtx.font = '400 ' + s(14) + 'px "Fragment Mono", monospace';
        pCtx.fillStyle = t.dim;
        pCtx.fillText('URGE INTENSITY', marginX, statsY);
        const uy = statsY + s(16);
        const uw = w - marginX * 2;
        const uCols = heatmapColors();
        const uN = getDaysInYear(currentYear);
        const yS = new Date(currentYear, 0, 1);
        const sD = yS.getDay();
        const sO = sD === 0 ? 6 : sD - 1;
        const uW = Math.ceil((sO + uN) / 7);
        const ucW = uw / uW;
        const ucH = s(16) / 7;
        const eCol = t.neutral;
        for (let d = 0; d < uN; d++) {
            const dt = new Date(yS);
            dt.setDate(yS.getDate() + d);
            const ds = formatDateStr(dt);
            const dw = (sO + d) % 7;
            const wk = Math.floor((sO + d) / 7);
            const urg = urgesData[ds];
            const inten = urg && urg.length > 0 ? Math.max.apply(null, urg.map(function(u) { return u.intensity; })) : 0;
            pCtx.fillStyle = inten === 0 ? eCol : uCols[inten - 1];
            pCtx.fillRect(marginX + wk * ucW, uy + dw * ucH, Math.max(ucW - 0.5, 1), Math.max(ucH - 0.5, 1));
        }
        pCtx.fillStyle = t.dim;
        pCtx.font = '400 ' + s(10) + 'px "Fragment Mono", monospace';
        pCtx.textAlign = 'right';
        ['M','T','W','T','F','S','S'].forEach(function(l, i) {
            pCtx.fillText(l, marginX - s(4), uy + i * ucH + ucH / 2 + s(3));
        });
        pCtx.textAlign = 'left';
    }

    pCtx.font = 'italic 400 ' + s(22) + 'px "Fraunces", serif';
    pCtx.fillStyle = t.dim;
    pCtx.fillText('ANALOGUE ARCHIVE \u00B7 ' + currentYear, marginX, h - s(80));

    pCanvas.toBlob(function(blob) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.download = 'archive_' + currentYear + '_' + config.theme + '.' + ext;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        if (navigator.share) {
            try {
                navigator.share({
                    title: 'My Archive ' + currentYear,
                    text: 'NoFap archive for ' + currentYear,
                    files: [new File([blob], link.download, { type: mimeType })]
                });
            } catch (e) {}
        }
    }, mimeType, 0.95);
};

/**
 * Handle clicking or dragging over a day cell
 */
const handleDayInteraction = (cell, isPointerDown = false) => {
    if (cell.classList.contains('empty')) return;

    const dateStr = cell.getAttribute('data-date');
    if (!dateStr) return;

    const currentState = casesData[dateStr] || 0;
    
    // Determine target state
    let newState;
    if (isPointerDown) {
        newState = (currentState + 1) % 3;
        // Lock this state in for the remainder of the drag
        dragState = newState; 
    } else {
        // We are dragging over this cell; just apply the locked state
        if (dragState === null) return;
        newState = dragState;
        if (currentState === newState) return; // Skip if already matches
    }
    
    lastChangedDate = dateStr;
    lastChangedState = newState;

    // Apply state
    if (newState === 0) {
        delete casesData[dateStr];
        delete casesData[dateStr + '_trigger'];
        cell.classList.remove('success', 'fail');
        if (isPointerDown) playSound('neutral');
        if (!isPointerDown) dragFailDates.delete(dateStr);
    } else if (newState === 1) {
        casesData[dateStr] = 1;
        cell.classList.remove('fail');
        cell.classList.add('success');
        if (isPointerDown) playSound('success');
        if (!isPointerDown) dragFailDates.delete(dateStr);
    } else if (newState === 2) {
        casesData[dateStr] = 2;
        cell.classList.remove('success');
        cell.classList.add('fail');
        if (isPointerDown) {
            playSound('fail');
            recordReset(dateStr);
        } else {
            dragFailDates.add(dateStr);
        }
    }

    // Apply animation
    cell.classList.remove('animate-pop');
    void cell.offsetWidth;
    cell.classList.add('animate-pop');
    setTimeout(() => cell.classList.remove('animate-pop'), 500);
    if (isDragging) {
        cell.classList.add('drag-glow');
        setTimeout(() => cell.classList.remove('drag-glow'), 400);
    }

    // If it was a single click (not a drag), save immediately.
    // Otherwise, we wait for the global pointerup event to save performance.
    if (isPointerDown && !isDragging) {
        saveData();
        if (newState === 1 || newState === 2) {
            tryAutoFill(dateStr, newState);
        }
        // Show trigger modal for fail marks
        if (newState === 2) {
            showTriggerModal(dateStr);
        }
    }
};

/**
 * Calculate the streak count ending EXACTLY at a specific date
 * (Used for milestone markers on the grid)
 */
const getStreakAtDate = (dateStr) => {
    if (casesData[dateStr] !== 1) return 0;
    
    let count = 0;
    let curr = parseDateStr(dateStr);
    
    while (curr) {
        const s = formatDateStr(curr);
        if (casesData[s] === 1) {
            count++;
            curr.setDate(curr.getDate() - 1);
        } else {
            break;
        }
        if (curr.getFullYear() < currentYear) break;
    }
    return count;
};

const MILESTONES = {
    7: 'VII',
    14: 'XIV',
    30: 'XXX',
    60: 'LX',
    90: 'XC',
    100: 'C',
    365: 'CCCLXV'
};

const ENCOURAGEMENTS = [
    'This is a step, not a fall. Every attempt counts.',
    'He who falls and gets up is stronger than he who never falls.',
    'Today is a new day. The record continues.',
    'Progress is not a straight line. Keep going.',
    'You showed up. That is what matters.',
    'A stumble is not the end of the road.',
    'Each day is a fresh chance to begin again.',
    'What matters is not how many times you fall, but how many times you rise.',
    'You are building a habit, not chasing perfection.',
    'The only failure is giving up. You are still here.'
];

const getEncouragement = () => ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];

/**
 * Record reset history + show encouragement when marking fail
 */
const recordReset = (failDateStr) => {
    const prevDay = new Date(failDateStr + 'T00:00:00');
    prevDay.setDate(prevDay.getDate() - 1);
    const prevDayStr = formatDateStr(prevDay);
    const streakBeforeReset = getStreakAtDate(prevDayStr);
    resetHistory.push({ date: failDateStr, streakLength: streakBeforeReset });
    showEncouragement(streakBeforeReset);
    checkAndEarnBadges();
};

/**
 * Encouragement Toast
 */
const showEncouragement = (days) => {
    const messages = [
        days + ' days is real progress. Every streak forges strength.',
        'You went ' + days + ' days. That matters. Get back up.',
        days + ' days of discipline. One slip doesn\'t erase that.',
        days + ' days strong. You learn more each time.',
        'A ' + days + '-day streak is a foundation to build on.',
        days + ' days of growth. The path continues.',
        'Progress isn\'t linear. ' + days + ' days proves you\'re moving forward.',
        days + ' days of commitment. Reset with intention.',
        'You lasted ' + days + ' days. That\'s data, not defeat.',
        days + ' days — each one a step toward mastery.'
    ];
    showToast(messages[Math.floor(Math.random() * messages.length)], 'fail', 4000);
};

/**
 * Confetti Celebration
 */
const fireConfetti = () => {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const cctx = canvas.getContext('2d');
    canvas.classList.add('active');

    const colors = ['#C9A84C', '#2E7D5E', '#B84A4A', '#5B7D9A', '#E8E0D4'];
    const particles = [];
    const count = 80;
    for (let i = 0; i < count; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: -20 - Math.random() * 200,
            w: 3 + Math.random() * 4,
            h: 3 + Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            vy: 1.5 + Math.random() * 3,
            vx: (Math.random() - 0.5) * 2,
            rot: Math.random() * 360,
            rv: (Math.random() - 0.5) * 6,
            opacity: 1
        });
    }
    let start;
    const duration = 2500;
    const step = (ts) => {
        if (!start) start = ts;
        const elapsed = ts - start;
        cctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.04;
            p.rot += p.rv;
            p.opacity = Math.max(0, 1 - elapsed / duration);
            cctx.save();
            cctx.translate(p.x, p.y);
            cctx.rotate(p.rot * Math.PI / 180);
            cctx.globalAlpha = p.opacity;
            cctx.fillStyle = p.color;
            cctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            cctx.restore();
        });
        if (elapsed < duration) requestAnimationFrame(step);
        else {
            canvas.classList.remove('active');
            cctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };
    requestAnimationFrame(step);
};

/**
 * Trigger Tag Modal (on fail mark)
 */
let pendingTriggerDate = null;
const showTriggerModal = (dateStr) => {
    pendingTriggerDate = dateStr;
    const ctx = document.getElementById('trigger-context');
    if (ctx) ctx.textContent = 'Tag what led to this relapse on ' + dateStr + ':';
    const encouragementEl = document.getElementById('encouragement-text');
    if (encouragementEl) encouragementEl.textContent = getEncouragement();
    const modal = document.getElementById('trigger-modal');
    if (modal) modal.classList.add('active');
};

const closeTriggerModal = () => {
    pendingTriggerDate = null;
    const modal = document.getElementById('trigger-modal');
    if (modal) modal.classList.remove('active');
};

const saveTriggerTag = (tag) => {
    if (!pendingTriggerDate) return;
    if (tag) {
        const existing = casesData[pendingTriggerDate];
        if (existing === 2) {
            casesData[pendingTriggerDate + '_trigger'] = tag;
            if (!triggersData[pendingTriggerDate]) triggersData[pendingTriggerDate] = [];
            triggersData[pendingTriggerDate].push(tag);
        }
    }
    pendingTriggerDate = null;
    closeTriggerModal();
    triggerReminderCheck();
};

/**
 * Urge Log Modal
 */
let pendingUrgeDate = null;
let selectedIntensity = 3;
let selectedUrgeTrigger = '';
let selectedMood = '';

const showUrgeModal = (dateStr) => {
    pendingUrgeDate = dateStr;
    selectedIntensity = 3;
    selectedUrgeTrigger = '';
    renderIntensityOptions();
    clearTriggerChips('urge-trigger-grid');
    const modal = document.getElementById('urge-modal');
    if (modal) {
        const header = modal.querySelector('.modal-header');
        if (header) header.textContent = 'Log Urge — ' + dateStr;
        modal.classList.add('active');
    }
};

const closeUrgeModal = () => {
    pendingUrgeDate = null;
    const modal = document.getElementById('urge-modal');
    if (modal) modal.classList.remove('active');
};

const renderIntensityOptions = () => {
    const container = document.getElementById('intensity-options');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
        const dot = document.createElement('button');
        dot.className = 'intensity-dot' + (i === selectedIntensity ? ' active' : '');
        dot.textContent = i;
        dot.addEventListener('click', () => {
            selectedIntensity = i;
            renderIntensityOptions();
        });
        container.appendChild(dot);
    }
};

const clearTriggerChips = (gridId) => {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.querySelectorAll('.trigger-chip').forEach(c => c.classList.remove('active'));
};

const saveUrgeLog = () => {
    if (!pendingUrgeDate) return;
    if (!urgesData[pendingUrgeDate]) urgesData[pendingUrgeDate] = [];
    urgesData[pendingUrgeDate].push({
        timestamp: Date.now(),
        intensity: selectedIntensity,
        trigger: selectedUrgeTrigger,
        mood: selectedMood
    });
    if (selectedMood) {
        moodsData[pendingUrgeDate] = selectedMood;
    }
    pendingUrgeDate = null;
    selectedMood = '';
    saveData();
    closeUrgeModal();
};

/**
 * Achievement System
 */
const checkPerfectWeek = () => {
    const yearStart = new Date(currentYear, 0, 1);
    const startDow = yearStart.getDay();
    const daysToFirstMonday = startDow === 0 ? 1 : (8 - startDow) % 7;
    const totalDays = getDaysInYear(currentYear);
    for (let w = daysToFirstMonday; w + 7 <= totalDays; w += 7) {
        let perfect = true;
        for (let d = 0; d < 7; d++) {
            const day = new Date(yearStart);
            day.setDate(yearStart.getDate() + w + d);
            const dStr = formatDateStr(day);
            if (casesData[dStr] !== 1) { perfect = false; break; }
        }
        if (perfect) return true;
    }
    return false;
};

const checkPerfectMonth = () => {
    for (let m = 0; m < 12; m++) {
        const daysInMonth = getDaysInMonth(m, currentYear);
        let perfect = true;
        for (let d = 1; d <= daysInMonth; d++) {
            const dStr = currentYear + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            if (casesData[dStr] !== 1) { perfect = false; break; }
        }
        if (perfect) return true;
    }
    return false;
};

const BADGE_DEFS = [
    { id: 'first_week',   label: 'First Week',    icon: 'star',   desc: '7-day streak',       check: () => getStreakAtDate(todayStr) >= 7 },
    { id: 'two_weeks',    label: 'Two Weeks',     icon: 'two',    desc: '14-day streak',      check: () => getStreakAtDate(todayStr) >= 14 },
    { id: 'month_one',    label: 'Month One',     icon: 'moon',   desc: '30-day streak',      check: () => getStreakAtDate(todayStr) >= 30 },
    { id: 'sixty_days',   label: 'Sixty Days',    icon: 'sixty',  desc: '60-day streak',      check: () => getStreakAtDate(todayStr) >= 60 },
    { id: 'ninety',       label: 'Ninety',        icon: 'diamond',desc: '90-day streak',      check: () => getStreakAtDate(todayStr) >= 90 },
    { id: 'half_year',    label: 'Half Year',     icon: 'half',   desc: '180-day streak',     check: () => getStreakAtDate(todayStr) >= 180 },
    { id: 'full_year',    label: 'Full Year',     icon: 'full',   desc: '365-day streak',     check: () => getStreakAtDate(todayStr) >= 365 },
    { id: 'first_kept',   label: 'First Kept',    icon: 'first',  desc: 'First clean day',    check: () => { for (const d in casesData) { if (casesData[d] === 1) return true; } return false; } },
    { id: 'ten_kept',     label: '10 Kept',       icon: 'ten',    desc: '10 clean days',      check: () => { let c = 0; for (const d in casesData) { if (casesData[d] === 1) c++; } return c >= 10; } },
    { id: 'fifty_kept',   label: '50 Kept',       icon: 'fifty',  desc: '50 clean days',      check: () => { let c = 0; for (const d in casesData) { if (casesData[d] === 1) c++; } return c >= 50; } },
    { id: 'hundred_kept', label: '100 Kept',      icon: 'hundred',desc: '100 clean days',     check: () => { let c = 0; for (const d in casesData) { if (casesData[d] === 1) c++; } return c >= 100; } },
    { id: 'urge_logger',  label: 'Vigilant',      icon: 'eye',    desc: '10 urges logged',    check: () => { let c = 0; for (const d in urgesData) c += urgesData[d].length; return c >= 10; } },
    { id: 'comeback',     label: 'The Comeback',  icon: 'refresh',desc: 'Reset after 14+ day streak', check: () => resetHistory.some(r => r.streakLength >= 14) },
    { id: 'balanced',     label: 'Balanced',      icon: 'scale',  desc: 'Both success & fail marks', check: () => { let s = 0, f = 0; for (const d in casesData) { if (casesData[d] === 1) s++; if (casesData[d] === 2) f++; } return s > 0 && f > 0; } },
    { id: 'perfect_week', label: 'Perfect Week',  icon: 'pweek',  desc: 'Every day of a clean calendar week', check: checkPerfectWeek },
    { id: 'perfect_month',label: 'Perfect Month', icon: 'pmonth', desc: 'Every day of a clean calendar month', check: checkPerfectMonth },
    { id: 'resilient',    label: 'Resilient',     icon: 'res',    desc: 'Reset 5+ times and kept going', check: () => resetHistory.length >= 5 },
    { id: 'data_driven',  label: 'Data Driven',   icon: 'data',   desc: 'Tracked 30+ days', check: () => { let c = 0; for (const d in casesData) if (casesData[d] === 1 || casesData[d] === 2) c++; return c >= 30; } },
    { id: 'trigger_aware',label: 'Trigger Aware', icon: 'taware', desc: '5 unique trigger tags', check: () => { const tags = new Set(); for (const d in triggersData) triggersData[d].forEach(t => tags.add(t)); return tags.size >= 5; } },
    { id: 'unstoppable',  label: 'Unstoppable',   icon: 'unstopp',desc: 'Current streak beats previous best', check: () => { const cur = getStreakAtDate(todayStr); const bestFromHistory = resetHistory.length > 0 ? Math.max(...resetHistory.map(r => r.streakLength)) : 0; return cur >= 7 && cur > bestFromHistory; } }
];

const checkAndEarnBadges = () => {
    BADGE_DEFS.forEach(b => {
        if (!achievements.earned.includes(b.id) && b.check()) {
            achievements.earned.push(b.id);
            achievements.earnedAt[b.id] = Date.now();
            saveData();
            fireConfetti();
            playHaptic('badge');
            showToast('BADGE EARNED · ' + b.label, 'accent', 3200);
        }
    });
};

/**
 * Milestone Rings — SVG progress toward 7/14/30/60/90 day targets
 */
const renderMilestoneRings = () => {
    const container = document.getElementById('milestone-rings');
    if (!container) return;
    const currentStreak = getStreakAtDate(todayStr);
    const targets = [7, 14, 30, 60, 90];
    const circumference = 2 * Math.PI * 28;
    container.innerHTML = '';
    targets.forEach(t => {
        const pct = Math.min(currentStreak / t, 1);
        const offset = circumference * (1 - pct);
        const isLocked = currentStreak >= t;
        const ring = document.createElement('div');
        ring.className = 'ring-item' + (isLocked ? ' ring-earned' : '');
        ring.innerHTML = '<svg class="ring-svg" viewBox="0 0 64 64">' +
            '<circle class="ring-bg" cx="32" cy="32" r="28" fill="none" stroke-width="4"/>' +
            '<circle class="ring-fill" cx="32" cy="32" r="28" fill="none" stroke-width="4"' +
                ' stroke-dasharray="' + circumference + '" stroke-dashoffset="' + (isLocked ? 0 : offset) + '"' +
                ' style="transition: stroke-dashoffset 0.8s var(--ease-out);"/>' +
            (isLocked
                ? '<path d="M22 28 L30 36 L42 22" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'
                : '<text class="ring-pct" x="32" y="32" text-anchor="middle" dominant-baseline="central"' +
                    ' font-family="var(--font-display)" font-size="11" font-weight="700">' +
                    Math.round(pct * 100) + '%</text>'
            ) +
            '</svg>' +
            '<span class="ring-label">' + t + '<span class="ring-label-unit">d</span></span>';
        container.appendChild(ring);
    });
};

/**
 * Personal Records Board
 */
const renderPersonalRecords = () => {
    const container = document.getElementById('records-board');
    if (!container) return;
    const currentStreak = getStreakAtDate(todayStr);
    const bestStreak = resetHistory.length > 0 ? Math.max(...resetHistory.map(r => r.streakLength), currentStreak) : currentStreak;
    const lastFive = resetHistory.slice(-5).reverse();
    let html = '<div class="records-row records-best"><span class="records-label">Best Streak</span><span class="records-val">' + bestStreak + ' days</span></div>';
    if (bestStreak > 0 && currentStreak > 0) {
        const diff = bestStreak - currentStreak;
        html += '<div class="records-row records-beat"><span class="records-label">To beat record</span><span class="records-val">' + (diff > 0 ? diff + ' more' : 'CURRENT BEST') + '</span></div>';
    }
    if (lastFive.length > 0) {
        html += '<div class="records-divider"></div>';
        html += '<div class="records-subtitle">Recent Streaks</div>';
        lastFive.forEach(r => {
            html += '<div class="records-row"><span class="records-label">' + r.date + '</span><span class="records-val">' + r.streakLength + 'd</span></div>';
        });
    }
    container.innerHTML = html;
};

/**
 * Monthly Purity Bars
 */
const renderMonthlyPurity = () => {
    const container = document.getElementById('purity-bars');
    if (!container) return;
    container.innerHTML = '';
    for (let m = 0; m < 12; m++) {
        const daysInMon = getDaysInMonth(m, currentYear);
        let success = 0, fail = 0;
        for (let d = 1; d <= daysInMon; d++) {
            const ds = currentYear + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            if (casesData[ds] === 1) success++;
            else if (casesData[ds] === 2) fail++;
        }
        const total = success + fail;
        const pct = total > 0 ? Math.round((success / total) * 100) : 0;
        const month = document.createElement('div');
        month.className = 'purity-month';
        const barBg = document.createElement('div');
        barBg.className = 'purity-bar-bg';
        const fill = document.createElement('div');
        fill.className = 'purity-bar-fill';
        fill.style.height = pct + '%';
        if (pct >= 80) fill.classList.add('high');
        else if (pct >= 50) fill.classList.add('mid');
        else if (pct > 0) fill.classList.add('low');
        barBg.appendChild(fill);
        month.appendChild(barBg);
        const label = document.createElement('span');
        label.className = 'purity-month-label';
        label.textContent = ['J','F','M','A','M','J','J','A','S','O','N','D'][m];
        month.appendChild(label);
        const val = document.createElement('span');
        val.className = 'purity-pct';
        val.textContent = total > 0 ? pct + '%' : '—';
        month.appendChild(val);
        container.appendChild(month);
    }
};

/**
 * Achievement Badges Grid
 */
const renderAchievementBadges = () => {
    const container = document.getElementById('badge-grid');
    const countEl = document.getElementById('badge-count');
    if (!container) return;
    container.innerHTML = '';
    const earnedCount = achievements.earned.length;
    if (countEl) countEl.textContent = earnedCount + ' / ' + BADGE_DEFS.length + ' earned';
    BADGE_DEFS.forEach(b => {
        const earned = achievements.earned.includes(b.id);
        const item = document.createElement('div');
        item.className = 'badge-item' + (earned ? ' badge-earned' : ' badge-locked');
        const icons = {
            star: '✦', moon: '◈', diamond: '◆', refresh: '⟳', pen: '✎', eye: '⊙', scale: '⚖',
            two: '⬟', sixty: '◇', half: '⬢', full: '⬡', first: '●', ten: '◉', fifty: '◎', hundred: '⊛',
            pweek: '⬣', pmonth: '⬥', res: '⚔', data: '◐', taware: '◑', unstopp: '◒'
        };
        item.innerHTML = `
            <div class="badge-icon-wrap">${icons[b.icon] || '○'}</div>
            <span class="badge-label">${b.label}</span>
            <span class="badge-desc">${b.desc}</span>
        `;
        container.appendChild(item);
    });
};

/**
 * Pattern Insights
 */
const renderPatternInsights = () => {
    const container = document.getElementById('insights-card');
    if (!container) return;
    const totalSuccess = Object.values(casesData).filter(v => v === 1).length;
    const totalFail = Object.values(casesData).filter(v => v === 2).length;
    const totalInputs = totalSuccess + totalFail;
    if (totalInputs === 0) {
        container.innerHTML = '<div class="insight-empty">Start marking days to see patterns emerge.</div>';
        return;
    }
    const currentStreak = getStreakAtDate(todayStr);
    const avgStreak = resetHistory.length > 0 ? Math.round(resetHistory.reduce((a, b) => a + b.streakLength, 0) / resetHistory.length) : currentStreak;
    const successRate = Math.round((totalSuccess / totalInputs) * 100);
    const bestRecorded = Math.max(...resetHistory.map(r => r.streakLength), currentStreak);

    // Day-of-week fail analysis
    const dowFail = [0,0,0,0,0,0,0];
    for (const d in casesData) {
        if (casesData[d] === 2) {
            const dt = parseDateStr(d);
            if (dt) dowFail[dt.getDay()]++;
        }
    }
    const maxDow = Math.max(...dowFail);
    const worstDay = maxDow > 0 ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dowFail.indexOf(maxDow)] : null;

    // Trend: early vs recent half of reset history
    let isTrendingUp = false;
    if (resetHistory.length > 1) {
        const mid = Math.floor(resetHistory.length / 2);
        const firstHalf = resetHistory.slice(0, mid);
        const secondHalf = resetHistory.slice(mid);
        const avgFirst = firstHalf.reduce((a, b) => a + b.streakLength, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((a, b) => a + b.streakLength, 0) / secondHalf.length;
        isTrendingUp = avgSecond > avgFirst * 1.2;
    }

    const todayUrges = urgesData[todayStr];

    // Build 4 distinct, non-duplicative insights
    const insights = [];

    // 1. Overall success rate (always shown)
    insights.push({ icon: 'chart', text: successRate + '% success rate across ' + totalInputs + ' tracked days.' });

    // 2. Combined streak summary (avg + current comparison, never both separately)
    if (currentStreak > 0 || avgStreak > 0) {
        if (currentStreak > 0 && avgStreak > 0) {
            const relation = currentStreak >= avgStreak ? 'exceeds your' : 'below your';
            insights.push({ icon: 'trend-up', text: 'Current: ' + currentStreak + 'd (' + relation + ' avg of ' + avgStreak + 'd).' });
        } else if (currentStreak > 0) {
            insights.push({ icon: 'trend-up', text: 'Current streak: ' + currentStreak + 'd.' });
        } else {
            insights.push({ icon: 'trend-up', text: 'Average streak: ' + avgStreak + 'd across ' + resetHistory.length + ' cycles.' });
        }
    }

    // 3. Worst relapse day (if data supports)
    if (worstDay) {
        insights.push({ icon: 'pin', text: 'Relapses most common on ' + worstDay + '.' });
    }

    // 4. Highest-significance insight: trend, record, or urges
    if (isTrendingUp) {
        insights.push({ icon: 'refresh', text: 'Streaks trending upward — you\'re improving over time.' });
    } else if (bestRecorded > 0 && currentStreak >= bestRecorded && currentStreak >= 7) {
        insights.push({ icon: 'trophy', text: 'All-time best: ' + bestRecorded + 'd streak.' });
    } else if (todayUrges && todayUrges.length > 0) {
        insights.push({ icon: 'bolt', text: todayUrges.length + ' urge(s) logged today. Awareness is strength.' });
    }

    const iconSvgs = {
        'chart': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>',
        'trend-up': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
        'pin': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>',
        'refresh': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
        'trophy': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>',
        'bolt': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
    };

    container.innerHTML = insights.slice(0, 4).map(i =>
        '<div class="insight-row"><span class="insight-icon">' + (iconSvgs[i.icon] || '') + '</span><span class="insight-text">' + i.text + '</span></div>'
    ).join('');
};

/**
 * Get days in year (leap-aware)
 */
const getDaysInYear = (year) =>
    (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;

/**
 * Design system color resolver for canvas
 */
const designColor = (cssVar, fallback, alpha) => {
    const hex = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || fallback;
    if (alpha == null) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
};

const isDarkTheme = () => document.documentElement.getAttribute('data-theme') !== 'light';

const heatmapColors = () => {
    const f = designColor('--color-fail', '#B84A4A');
    const r = parseInt(f.slice(1, 3), 16);
    const g = parseInt(f.slice(3, 5), 16);
    const b = parseInt(f.slice(5, 7), 16);
    return [
        'rgba(' + r + ',' + g + ',' + b + ',0.2)',
        'rgba(' + r + ',' + g + ',' + b + ',0.4)',
        'rgba(' + r + ',' + g + ',' + b + ',0.6)',
        'rgba(' + r + ',' + g + ',' + b + ',0.8)',
        f
    ];
};

/**
 * Draw Urge Heatmap — Canvas 600×200, 5-level intensity
 */
const drawHeatmap = () => {
    const canvas = document.getElementById('heatmap-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const emptyColor = designColor('--color-neutral', isDarkTheme() ? '#242220' : '#E4E0D8');
    const levels = heatmapColors();
    const textColor = designColor('--text-dim', '#7D7568');

    const yearStart = new Date(currentYear, 0, 1);
    const startDay = yearStart.getDay();
    const startOffset = startDay === 0 ? 6 : startDay - 1;
    const totalDays = getDaysInYear(currentYear);
    const totalWeeks = Math.ceil((startOffset + totalDays) / 7);
    const cellSize = Math.min((width - 30) / totalWeeks, (height - 20) / 8);
    const padX = (width - cellSize * totalWeeks) / 2;
    const padY = 16;

    for (let d = 0; d < totalDays; d++) {
        const date = new Date(yearStart);
        date.setDate(yearStart.getDate() + d);
        const dStr = formatDateStr(date);
        const dayOfWeek = (startOffset + d) % 7;
        const week = Math.floor((startOffset + d) / 7);
        const urges = urgesData[dStr];
        const intensity = urges && urges.length > 0 ? Math.max(...urges.map(u => u.intensity)) : 0;

        ctx.fillStyle = intensity === 0 ? emptyColor : levels[intensity - 1];
        ctx.fillRect(padX + week * cellSize, padY + dayOfWeek * cellSize, cellSize - 0.5, cellSize - 0.5);
    }

    ctx.fillStyle = textColor;
    ctx.font = '8px Fragment Mono, monospace';
    ctx.textAlign = 'right';
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((l, i) => {
        ctx.fillText(l, padX - 3, padY + i * cellSize + cellSize / 2 + 3);
    });
};

/**
 * Draw Trend — Full-year line chart of daily streak values
 */
const drawTrend = () => {
    const canvas = document.getElementById('trend-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    const lineColor = designColor('--color-success', '#2E7D5E');
    const fillColor = designColor('--color-success', '#2E7D5E', 0.12);
    const gridColor = designColor('--border-subtle', '#2F2E2C');
    const textColor = designColor('--text-dim', '#7D7568');
    const failColor = designColor('--color-fail', '#B84A4A');

    const totalDays = getDaysInYear(currentYear);
    const pad = { top: 16, right: 16, bottom: 28, left: 32 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const yearStart = new Date(currentYear, 0, 1);
    let streak = 0;
    const data = [];
    for (let i = 0; i < totalDays; i++) {
        const d = new Date(yearStart);
        d.setDate(yearStart.getDate() + i);
        const s = formatDateStr(d);
        if (casesData[s] === 1) streak++;
        else if (casesData[s] === 2) streak = 0;
        data.push(streak);
    }

    const maxVal = Math.max(...data, 1);

    const toX = (i) => pad.left + (i / (totalDays - 1)) * plotW;
    const toY = (v) => pad.top + plotH - (v / maxVal) * plotH;

    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (plotH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(toX(0), pad.top + plotH);
    data.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
    ctx.lineTo(toX(totalDays - 1), pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.beginPath();
    data.forEach((v, i) => {
        const x = toX(i);
        const y = toY(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Fail markers
    data.forEach((v, i) => {
        if (i > 0 && v === 0 && data[i - 1] > 0) {
            ctx.beginPath();
            ctx.arc(toX(i), toY(0) + 4, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = failColor;
            ctx.fill();
        }
    });

    ctx.fillStyle = textColor;
    ctx.font = '9px Fragment Mono, monospace';
    ctx.textAlign = 'center';
    const months = ['J','F','M','A','M','J','J','A','S','O','N','D'];
    months.forEach((m, mi) => {
        const dayOfYear = Math.floor((new Date(currentYear, mi, 15) - yearStart) / 86400000);
        ctx.fillText(m, toX(Math.min(dayOfYear, totalDays - 1)), height - 4);
    });
};

/**
 * Analyze Patterns — triggers by DOW, time-of-day, recurring triggers
 */
const analyzePatterns = () => {
    const stats = (() => {
        let totalKept = 0, totalFail = 0, totalUrges = 0;
        for (const date in casesData) {
            if (casesData[date] === 1) totalKept++;
            else if (casesData[date] === 2) totalFail++;
        }
        for (const date in urgesData) totalUrges += urgesData[date].length;
        return { totalKept, totalFail, totalUrges };
    })();

    const insights = [];

    // Day of week analysis
    const dayFailCount = [0, 0, 0, 0, 0, 0, 0];
    const yearStart = new Date(currentYear, 0, 1);
    const startDay = yearStart.getDay();
    const startOffset = startDay === 0 ? 6 : startDay - 1;
    const totalDays = getDaysInYear(currentYear);

    for (let i = 0; i < totalDays; i++) {
        const d = new Date(yearStart);
        d.setDate(yearStart.getDate() + i);
        const dStr = formatDateStr(d);
        if (casesData[dStr] === 2) {
            const dow = (startOffset + i) % 7;
            dayFailCount[dow]++;
        }
    }

    const maxFails = Math.max(...dayFailCount);
    if (maxFails > 0) {
        const worstDay = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dayFailCount.indexOf(maxFails)];
        insights.push({ icon: 'svg-day', text: 'Most relapses happen on ' + worstDay, sub: maxFails + ' total' });
    }

    // Most common trigger
    const triggerCounts = {};
    for (const date in triggersData) {
        triggersData[date].forEach(t => {
            triggerCounts[t] = (triggerCounts[t] || 0) + 1;
        });
    }
    const sortedTriggers = Object.entries(triggerCounts).sort((a, b) => b[1] - a[1]);
    if (sortedTriggers.length > 0) {
        insights.push({ icon: 'svg-search', text: 'Most common trigger: ' + sortedTriggers[0][0], sub: sortedTriggers[0][1] + ' times' });
    }

    // Total urges
    if (stats.totalUrges > 0) {
        insights.push({ icon: 'svg-bolt', text: 'Urges logged: ' + stats.totalUrges, sub: 'Keep tracking to spot patterns' });
    }

    // Current vs prior 30-day comparison
    const recent30 = [], prior30 = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 60; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dStr = formatDateStr(d);
        const state = casesData[dStr] || 0;
        if (i < 30) recent30.push(state);
        else prior30.push(state);
    }
    const recentKept = recent30.filter(s => s === 1).length;
    const priorKept = prior30.filter(s => s === 1).length;
    if (recentKept > priorKept) {
        insights.push({ icon: 'svg-up', text: 'Trending up! Last 30 days better than before.', sub: recentKept + ' vs ' + priorKept + ' days kept' });
    } else if (recentKept < priorKept) {
        insights.push({ icon: 'svg-down', text: 'Recent 30 days need attention.', sub: recentKept + ' vs ' + priorKept + ' days kept' });
    }

    if (insights.length === 0) {
        insights.push({ icon: 'svg-star', text: 'Start tracking to see patterns emerge.', sub: 'Log your days and urges to get insights' });
    }

    return insights;
};

/**
 * Render detailed insights modal body
 */
const renderInsightsModal = () => {
    const container = document.getElementById('insights-body');
    if (!container) return;
    const insights = analyzePatterns();
    container.innerHTML = '';
    insights.forEach(ins => {
        const card = document.createElement('div');
        card.className = 'insight-card';
        const iconRow = document.createElement('div');
        iconRow.className = 'insight-card-icon';
        let svgHtml = '';
        if (ins.icon === 'svg-day') svgHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
        else if (ins.icon === 'svg-search') svgHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
        else if (ins.icon === 'svg-bolt') svgHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
        else if (ins.icon === 'svg-up') svgHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>';
        else if (ins.icon === 'svg-down') svgHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>';
        else svgHtml = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
        iconRow.innerHTML = svgHtml;
        card.appendChild(iconRow);
        const textEl = document.createElement('div');
        textEl.className = 'insight-card-text';
        textEl.textContent = ins.text;
        card.appendChild(textEl);
        const subEl = document.createElement('div');
        subEl.className = 'insight-card-sub';
        subEl.textContent = ins.sub;
        card.appendChild(subEl);
        container.appendChild(card);
    });
};

/**
 * Masthead Weekly Distribution — weekday success % bars (desktop)
 */
const renderMastheadDistribution = () => {
    const container = document.getElementById('masthead-dist-grid');
    if (!container) return;
    container.innerHTML = '';
    const dayNames = ['M','T','W','T','F','S','S'];
    const dayStats = [{s:0,f:0,t:0},{s:0,f:0,t:0},{s:0,f:0,t:0},{s:0,f:0,t:0},{s:0,f:0,t:0},{s:0,f:0,t:0},{s:0,f:0,t:0}];
    for (const dStr in casesData) {
        const dObj = parseDateStr(dStr);
        if (!dObj) continue;
        const dow = dObj.getDay();
        if (casesData[dStr] === 1) { dayStats[dow].s++; dayStats[dow].t++; }
        else if (casesData[dStr] === 2) { dayStats[dow].f++; dayStats[dow].t++; }
    }
    for (let i = 0; i < 7; i++) {
        const stat = dayStats[i];
        const pct = stat.t > 0 ? Math.round((stat.s / stat.t) * 100) : 0;
        const col = document.createElement('div');
        col.className = 'dist-col';
        col.innerHTML = '<span class="dist-day">' + dayNames[i] + '</span><span class="dist-val ' + (pct >= 50 ? 'success' : 'fail') + '">' + pct + '%</span><div class="dist-bar-bg"><div class="dist-bar ' + (pct >= 50 ? 'success' : 'fail') + '" style="height:' + Math.max(pct || 2, 2) + '%"></div></div>';
        container.appendChild(col);
    }
};

/**
 * Trigger Reminder Check — prompt after 3 fails in 7 days
 */
const triggerReminderCheck = () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    let failCount = 0;
    for (const dStr in casesData) {
        if (casesData[dStr] === 2) {
            const d = parseDateStr(dStr);
            if (d && d >= sevenDaysAgo) failCount++;
        }
    }
    if (failCount >= 3) {
        showToast(failCount + ' relapses in the past 7 days', 'fail', 5000);
    }
};

/**
 * SMART AUTO-FILL ENGINE
 * 
 * Strict conditions:
 * 1. Only fills gaps between two days of the SAME state (both green or both red).
 * 2. The gap must be <= 5 days (no massive auto-fills).
 * 3. Both endpoints must be within the same month.
 * 4. The gap days must ALL be neutral (state 0 / undefined). If ANY day
 *    in the gap already has a different state, auto-fill is blocked.
 * 5. The user MUST explicitly confirm, shown the exact dates being filled.
 */
const tryAutoFill = (changedDateStr, newState) => {
    const changedDate = parseDateStr(changedDateStr);
    if (!changedDate) return;
    
    const MAX_GAP = 5;
    
    // Search BACKWARD: find nearest same-state day before changedDate
    let fillStart = null;
    let searchBack = new Date(changedDate);
    for (let i = 0; i < MAX_GAP + 1; i++) {
        searchBack.setDate(searchBack.getDate() - 1);
        if (searchBack.getMonth() !== changedDate.getMonth() || searchBack.getFullYear() !== changedDate.getFullYear()) break;
        const sStr = formatDateStr(searchBack);
        const sState = casesData[sStr];
        if (sState === newState) {
            fillStart = new Date(searchBack);
            break;
        }
        if (sState !== undefined && sState !== 0 && sState !== newState) break;
    }
    
    // Search FORWARD: find nearest same-state day after changedDate
    let fillEnd = null;
    let searchFwd = new Date(changedDate);
    for (let i = 0; i < MAX_GAP + 1; i++) {
        searchFwd.setDate(searchFwd.getDate() + 1);
        if (searchFwd.getMonth() !== changedDate.getMonth() || searchFwd.getFullYear() !== changedDate.getFullYear()) break;
        const sStr = formatDateStr(searchFwd);
        const sState = casesData[sStr];
        if (sState === newState) {
            fillEnd = new Date(searchFwd);
            break;
        }
        if (sState !== undefined && sState !== 0 && sState !== newState) break;
    }
    
    // Determine which direction has a valid gap to fill
    let gapDates = [];
    
    if (fillStart) {
        const candidates = collectGapDates(fillStart, changedDate);
        if (candidates.length > 0 && candidates.length <= MAX_GAP && allNeutral(candidates)) {
            gapDates = gapDates.concat(candidates);
        }
    }
    
    if (fillEnd) {
        const candidates = collectGapDates(changedDate, fillEnd);
        if (candidates.length > 0 && candidates.length <= MAX_GAP && allNeutral(candidates)) {
            gapDates = gapDates.concat(candidates);
        }
    }
    
    if (gapDates.length === 0) return;
    
    // Remove duplicates
    gapDates = [...new Set(gapDates)];
    gapDates.sort();
    
    // Format readable date list for confirmation
    const stateLabel = newState === 1 ? 'Clean' : 'Relapse';
    
    // Minimalist modal content
    autofillHugeStat.textContent = gapDates.length;
    if (autofillStatLabel) {
        autofillStatLabel.textContent = gapDates.length === 1 ? 'Day to fill' : 'Days to fill';
    }
    autofillTargetState.textContent = stateLabel;
    
    // Style the state text to match its color
    autofillTargetState.style.color = newState === 1 ? 'var(--color-success)' : 'var(--color-fail)';
    
    // Store state globally for the event listener attached in attachEventListeners()
    pendingAutofill = {
        gapDates: gapDates,
        newState: newState
    };
    
    // Show modal
    autofillModal.classList.add('active');
};

// Helper: parse YYYY-MM-DD to Date
const parseDateStr = (str) => {
    const parts = str.split('-');
    if (parts.length !== 3) return null;
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    d.setHours(0,0,0,0);
    return d;
};

// Helper: format Date to YYYY-MM-DD
const formatDateStr = (d) => {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

// Helper: collect all dates strictly between startDate and endDate (exclusive)
const collectGapDates = (startDate, endDate) => {
    const result = [];
    const cursor = new Date(startDate);
    cursor.setDate(cursor.getDate() + 1);
    while (cursor < endDate) {
        result.push(formatDateStr(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return result;
};

// Helper: check all gap dates are neutral (undefined or 0)
const allNeutral = (dates) => {
    return dates.every(d => !casesData[d] || casesData[d] === 0);
};

/**
 * Handle Margin Note Modal
 */
const openNoteModal = (e) => {
    const cell = e.target;
    if (cell.classList.contains('empty')) return;
    
    activeNoteDate = cell.getAttribute('data-date');
    if (!activeNoteDate) return;

    const dateObj = parseDateStr(activeNoteDate);
    if (!dateObj) return;
    
    modalTitle.textContent = `${MONTHS[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;
    noteTextarea.value = notesData[activeNoteDate] || '';
    
    noteModal.classList.add('active');
    setTimeout(() => noteTextarea.focus(), 100);
};

const closeNoteModal = () => {
    if (noteModal) noteModal.classList.remove('active');
    activeNoteDate = null;
    const statsPanel = document.querySelector('.stats-panel');
    const sidebar = document.getElementById('notes-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!statsPanel.classList.contains('active') && !sidebar.classList.contains('active')) {
        document.body.style.overflow = '';
    }
    if (!sidebar.classList.contains('active') && overlay) overlay.classList.remove('active');
    updateBottomNav();
};

const closeAllOverlays = () => {
    const statsPanel = document.querySelector('.stats-panel');
    if (statsPanel) statsPanel.classList.remove('active');
    const sidebar = document.getElementById('notes-sidebar');
    if (sidebar) sidebar.classList.remove('active');
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.classList.remove('active');
    if (noteModal) noteModal.classList.remove('active');
    if (autofillModal) autofillModal.classList.remove('active');
    const posterModal = document.getElementById('poster-modal');
    if (posterModal) posterModal.classList.remove('active');
    const urgeModal = document.getElementById('urge-modal');
    if (urgeModal) urgeModal.classList.remove('active');
    const triggerModal = document.getElementById('trigger-modal');
    if (triggerModal) triggerModal.classList.remove('active');
    const trendModal = document.getElementById('trend-modal');
    if (trendModal) trendModal.classList.remove('active');
    document.body.style.overflow = '';
    activeNoteDate = null;
    pendingAutofill = null;
    pendingTriggerDate = null;
    pendingUrgeDate = null;
    updateBottomNav();
};

const updateBottomNav = () => {
    const items = document.querySelectorAll('.bnav-item');
    items.forEach(item => item.classList.remove('active'));
    const statsPanel = document.querySelector('.stats-panel');
    const sidebar = document.getElementById('notes-sidebar');
    if (statsPanel && statsPanel.classList.contains('active')) {
        const statsBtn = document.getElementById('bnav-stats');
        if (statsBtn) statsBtn.classList.add('active');
    }
    if (sidebar && sidebar.classList.contains('active')) {
        const noteBtn = document.getElementById('bnav-note');
        if (noteBtn) noteBtn.classList.add('active');
    }
};

const saveNoteModal = () => {
    if (!activeNoteDate) return;
    const val = noteTextarea.value.trim();
    if (val) {
        notesData[activeNoteDate] = val;
    } else {
        delete notesData[activeNoteDate];
    }
    saveData();
    closeNoteModal();
    renderCalendar();
    renderSidebarNotes();
};

/**
 * Render the full 12 month calendar
 */
const renderCalendar = () => {
    calendarGrid.innerHTML = ''; // Clear existing

    MONTHS.forEach((monthName, mIndex) => {
        const monthCard = document.createElement('div');
        monthCard.className = 'month-card';

        // Header
        const monthHeader = document.createElement('div');
        monthHeader.className = 'month-header';
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'month-name';
        titleSpan.textContent = monthName;
        
        const numSpan = document.createElement('span');
        numSpan.className = 'month-number';
        numSpan.textContent = 'NO. ' + (mIndex + 1).toString().padStart(2, '0');
        
        // Calculate Monthly Completion %
        const daysInMon = getDaysInMonth(mIndex, currentYear);
        let monthSuccessCount = 0;
        for (let d = 1; d <= daysInMon; d++) {
            const dStr = currentYear + '-' + String(mIndex + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            if (casesData[dStr] === 1) monthSuccessCount++;
        }
        const pctValue = Math.round((monthSuccessCount / daysInMon) * 100);
        
        const pctSpan = document.createElement('span');
        pctSpan.className = 'month-pct';
        if (pctValue >= 70) pctSpan.classList.add('high');
        else if (pctValue >= 30) pctSpan.classList.add('mid');
        else if (pctValue > 0) pctSpan.classList.add('low');
        pctSpan.textContent = pctValue + '%';
        
        // Wrap right-side info in a meta container
        const metaContainer = document.createElement('span');
        metaContainer.className = 'month-meta';
        metaContainer.appendChild(pctSpan);
        metaContainer.appendChild(numSpan);
        
        monthHeader.appendChild(titleSpan);
        monthHeader.appendChild(metaContainer);
        monthCard.appendChild(monthHeader);

        // Days container
        const daysGrid = document.createElement('div');
        daysGrid.className = 'days-grid';

        // Inject day labels
        DAYS_OF_WEEK.forEach(day => {
            const label = document.createElement('div');
            label.className = 'day-label';
            label.textContent = day;
            daysGrid.appendChild(label);
        });

        const firstDay = getFirstDayOfMonth(mIndex, currentYear);
        
        const totalCells = Math.ceil((firstDay + daysInMon) / 7) * 7;

        // Week number labels (absolute positioned via CSS)
        const totalWeeks = Math.ceil((firstDay + daysInMon) / 7);
        for (let w = 0; w < totalWeeks; w++) {
            const weekNum = document.createElement('span');
            weekNum.className = 'week-label';
            weekNum.textContent = 'W' + (w + 1);
            weekNum.style.top = 'calc(' + (w + 1) + ' * (100% / ' + (totalWeeks + 1) + '))';
            daysGrid.appendChild(weekNum);
        }

        for (let i = 0; i < totalCells; i++) {
            const cell = document.createElement('div');
            cell.className = 'day-cell';

            if (i < firstDay || i >= firstDay + daysInMon) {
                cell.classList.add('empty');
            } else {
                const dayNum = i - firstDay + 1;
                cell.textContent = dayNum;
                
                // Format YYYY-MM-DD
                const dateStr = `${currentYear}-${String(mIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                cell.setAttribute('data-date', dateStr);
                
                // Add friendly tooltip natively mapping e.g "March 16, 2026"
                cell.setAttribute('title', `${MONTHS[mIndex]} ${dayNum}, ${currentYear}`);

                // Mark today
                if (dateStr === todayStr) {
                    cell.classList.add('today');
                }

                // Check for notes
                if (notesData[dateStr]) {
                    cell.classList.add('has-note');
                }

                // Apply saved state
                const state = casesData[dateStr];
                if (state === 1) {
                    cell.classList.add('success');
                    
                    // Milestone Check
                    const streakCount = getStreakAtDate(dateStr);
                    if (MILESTONES[streakCount]) {
                        cell.classList.add('milestone');
                        cell.setAttribute('data-milestone', MILESTONES[streakCount]);
                    }
                }
                if (state === 2) cell.classList.add('fail');
                // Check for urges on this day
                if (urgesData[dateStr] && urgesData[dateStr].length > 0) {
                    cell.classList.add('has-urge');
                }
                // Unified interaction: pointerdown for mouse/pen drag, touch events for tap/double-tap/long-press
                let cellTouchStartY = 0;
                let cellLpTimer = null;
                let cellIsLongPress = false;
                let cellLastTap = 0;

                cell.addEventListener('touchstart', (e) => {
                    cellTouchStartY = e.touches[0].clientY;
                    cellIsLongPress = false;
                    cellLpTimer = setTimeout(() => {
                        cellIsLongPress = true;
                        if (navigator.vibrate) navigator.vibrate(20);
                        showUrgeModal(dateStr);
                    }, 600);
                }, { passive: true });

                cell.addEventListener('touchmove', (e) => {
                    const deltaY = Math.abs(e.touches[0].clientY - cellTouchStartY);
                    if (deltaY > 10 && cellLpTimer) {
                        clearTimeout(cellLpTimer);
                        cellLpTimer = null;
                    }
                }, { passive: true });

                cell.addEventListener('touchend', (e) => {
                    if (cellLpTimer) { clearTimeout(cellLpTimer); cellLpTimer = null; }
                    if (cellIsLongPress) { e.preventDefault(); return; }

                    const now = Date.now();
                    const tapLen = now - cellLastTap;
                    if (tapLen < 300 && tapLen > 0) {
                        e.preventDefault();
                        openNoteModal(e);
                        cellLastTap = 0;
                        return;
                    }
                    cellLastTap = now;
                    handleDayInteraction(cell, true);
                });

                // Mouse/pen pointer events (drag-painting)
                cell.addEventListener('pointerdown', (e) => {
                    if (e.pointerType === 'touch') return;
                    isDragging = true;
                    dragVisitedCount = 1;
                    handleDayInteraction(cell, true);
                });

                cell.addEventListener('pointerenter', (e) => {
                    if (isDragging && e.pointerType !== 'touch') {
                        dragVisitedCount++;
                        handleDayInteraction(cell, false);
                    }
                });

                // Desktop double-tap for notes (revert state cycle from second pointerdown)
                cell.addEventListener('dblclick', (e) => {
                    const ds = cell.getAttribute('data-date');
                    if (!ds) { openNoteModal(e); return; }
                    const cycled = casesData[ds] || 0;
                    const prev = (cycled + 2) % 3;
                    if (prev === 0) delete casesData[ds];
                    else casesData[ds] = prev;
                    cell.classList.remove('success', 'fail');
                    if (prev === 1) cell.classList.add('success');
                    else if (prev === 2) cell.classList.add('fail');
                    lastChangedState = prev;
                    openNoteModal(e);
                });
            }

            daysGrid.appendChild(cell);
        }

        monthCard.appendChild(daysGrid);
        calendarGrid.appendChild(monthCard);
    });
};

/**
 * Calculate Streak and Stats
 */
const updateStats = () => {
    let successCount = 0;
    let failCount = 0;
    
    // Count totals
    for (const date in casesData) {
        if (casesData[date] === 1) successCount++;
        else if (casesData[date] === 2) failCount++;
    }
    
    // Calculate Streak based on today downwards
    let currentStreak = 0;
    
    let checkDate = new Date();
    checkDate.setHours(0,0,0,0);

    let streakActive = true;
    
    while(streakActive) {
        const dStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        
        const state = casesData[dStr];
        
        if (dStr === todayStr && !state) {
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
        }

        if (state === 1) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            streakActive = false;
        }

        if (checkDate.getFullYear() < currentYear) {
            streakActive = false;
        }
    }

    // Calculate Record Streak (scan all consecutive success states across the entry record)
    let bestStreak = 0;
    let tempStreak = 0;
    
    // Sort all tracked dates chronologically using safe string comparison
    const allDates = Object.keys(casesData).sort((a, b) => a.localeCompare(b));
    let lastDate = null;
    
    // Day of Week tracking: 0=Sun, 1=Mon, ..., 6=Sat
    const dayStats = { 0: {s:0, f:0, t:0}, 1: {s:0, f:0, t:0}, 2: {s:0, f:0, t:0}, 3: {s:0, f:0, t:0}, 4: {s:0, f:0, t:0}, 5: {s:0, f:0, t:0}, 6: {s:0, f:0, t:0} };

    for (const dStr of allDates) {
        const state = casesData[dStr];
        const dObj = parseDateStr(dStr);
        if (!dObj) continue;
        const dow = dObj.getDay();

        if (state === 1) {
            dayStats[dow].s++;
            dayStats[dow].t++;
            
            // Streak logic
            if (lastDate) {
                const diffTime = Math.abs(dObj - lastDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 1) {
                    tempStreak++;
                } else {
                    tempStreak = 1;
                }
            } else {
                tempStreak = 1;
            }
            if (tempStreak > bestStreak) bestStreak = tempStreak;
            lastDate = dObj;
        } else if (state === 2) {
            dayStats[dow].f++;
            dayStats[dow].t++;
            tempStreak = 0;
            lastDate = dObj;
        } else {
            tempStreak = 0;
            lastDate = dObj;
        }
    }

    // Render Temporal Distribution
    const distGrid = document.getElementById('dist-grid');
    if (distGrid) {
        distGrid.innerHTML = '';
        const dayNames = ['S','M','T','W','T','F','S'];
        for (let i = 0; i < 7; i++) {
            const stat = dayStats[i];
            const sPct = stat.t > 0 ? Math.round((stat.s / stat.t) * 100) : 0;
            const fPct = stat.t > 0 ? Math.round((stat.f / stat.t) * 100) : 0;
            
            const dayCol = document.createElement('div');
            dayCol.className = 'dist-col';
            
            const dominantState = sPct >= fPct ? 'success' : 'fail';
            const pctVal = sPct >= fPct ? sPct : fPct;
            
            dayCol.innerHTML = `
                <span class="dist-day">${dayNames[i]}</span>
                <span class="dist-val ${dominantState}">${pctVal}%</span>
                <div class="dist-bar-bg">
                    <div class="dist-bar ${dominantState}" style="height: 0%"></div>
                </div>
            `;
            distGrid.appendChild(dayCol);
        }
        // Trigger bar animation after render
        requestAnimationFrame(() => {
            const bars = distGrid.querySelectorAll('.dist-bar');
            bars.forEach((bar, idx) => {
                const val = bar.parentElement.previousElementSibling;
                const pct = val ? parseInt(val.textContent) : 0;
                setTimeout(() => {
                    bar.style.height = Math.max(pct, 2) + '%';
                }, idx * 40);
            });
        });
    }

    // Animate numbers up
    animateValue(successVal, parseInt(successVal.textContent), successCount, 300);
    animateValue(failVal, parseInt(failVal.textContent), failCount, 300);
    animateValue(streakVal, parseInt(streakVal.textContent), currentStreak, 300);
    animateValue(bestStreakVal, parseInt(bestStreakVal.textContent), bestStreak, 300);

    // Dashboard panel extras
    const totalInputs = successCount + failCount;
    const now = new Date();
    const startOfYear = new Date(currentYear, 0, 0);
    const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
    const totalDaysInYear = (currentYear % 4 === 0 && (currentYear % 100 !== 0 || currentYear % 400 === 0)) ? 366 : 365;
    const yearProgress = Math.min(Math.round((dayOfYear / totalDaysInYear) * 100), 100);
    const daysLeft = totalDaysInYear - dayOfYear;
    const successRateVal = totalInputs > 0 ? Math.round((successCount / totalInputs) * 100) : 0;

    if (statsCurrentYear) statsCurrentYear.textContent = currentYear;
    if (daysTrackedEl) daysTrackedEl.textContent = totalInputs;
    if (daysRemainingEl) daysRemainingEl.textContent = Math.max(daysLeft, 0);
    if (successRateEl) successRateEl.textContent = successRateVal + '%';
    if (progressPctEl) progressPctEl.textContent = yearProgress + '%';
    if (progressRingFill) {
        const circumference = 2 * Math.PI * 52;
        const offset = circumference * (1 - yearProgress / 100);
        progressRingFill.style.strokeDashoffset = offset;
    }

    // Advanced PWA: Badging API
    if ('setAppBadge' in navigator) {
        if (currentStreak > 0) {
            navigator.setAppBadge(currentStreak);
        } else {
            navigator.clearAppBadge();
        }
    }
};

/**
 * Draw Sparkline (Horizon Line) for last 30 days
 */
const drawSparkline = () => {
    if (!ctx) return;
    
    const width = sparklineCanvas.width;
    const height = sparklineCanvas.height;
    ctx.clearRect(0, 0, width, height);
    
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const lineColor = isDark ? '#A8A5A0' : '#A8A5A0'; // Variable logic is tricky in canvas, hardcode soft gray
    const successColor = isDark ? '#205E41' : '#1E5033';
    const failColor = isDark ? '#D64235' : '#D13426';

    const daysToLookBack = 10;
    const points = [];
    
    let loopDate = new Date();
    loopDate.setHours(0,0,0,0);
    
    // Collect data points backwards
    for (let i = 0; i < daysToLookBack; i++) {
        const dStr = `${loopDate.getFullYear()}-${String(loopDate.getMonth() + 1).padStart(2, '0')}-${String(loopDate.getDate()).padStart(2, '0')}`;
        const state = casesData[dStr] || 0;
        points.unshift(state); // Add to front so oldest is index 0
        loopDate.setDate(loopDate.getDate() - 1);
    }
    
    const segmentWidth = width / (daysToLookBack - 1);
    const midY = height / 2;
    
    // Draw baseline
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Draw gradient fill area below line
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, isDark ? 'rgba(46, 125, 94, 0.08)' : 'rgba(46, 125, 94, 0.06)');
    gradient.addColorStop(1, 'transparent');
    
    // Build success/fail fill regions
    ctx.beginPath();
    ctx.moveTo(0, midY);
    points.forEach((state, i) => {
        const x = i * segmentWidth;
        let y = midY;
        if (state === 1) y = midY - 6;
        else if (state === 2) y = midY + 6;
        ctx.lineTo(x, y);
    });
    ctx.lineTo(width, midY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw connecting line
    ctx.beginPath();
    points.forEach((state, i) => {
        const x = i * segmentWidth;
        let y = midY;
        if (state === 1) y = midY - 6;
        else if (state === 2) y = midY + 6;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw dots
    points.forEach((state, i) => {
        const x = i * segmentWidth;
        let y = midY;
        let radius = 1.5;
        let color = lineColor;
        
        if (state === 1) {
            y = midY - 6;
            color = successColor;
            radius = 3;
        } else if (state === 2) {
            y = midY + 6;
            color = failColor;
            radius = 3;
        }
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Glow dot for active days
        if (state === 1 || state === 2) {
            ctx.beginPath();
            ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
            ctx.fillStyle = state === 1 ? 'rgba(46, 125, 94, 0.15)' : 'rgba(184, 74, 74, 0.15)';
            ctx.fill();
        }
    });

    // Ghost continuation dots (endless effect)
    const ghostCount = 4;
    const lastX = (points.length - 1) * segmentWidth;
    const lastY = points[points.length - 1] === 1 ? midY - 6 : points[points.length - 1] === 2 ? midY + 6 : midY;
    for (let i = 1; i <= ghostCount; i++) {
        const gx = lastX + i * (segmentWidth * 0.6);
        const gy = lastY;
        const alpha = 1 - (i / (ghostCount + 1));
        ctx.beginPath();
        ctx.arc(gx, gy, 2 * alpha, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.globalAlpha = alpha * 0.4;
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Edge gradient fades
    const fadeWidth = 20;
    const edgeGradientL = ctx.createLinearGradient(0, 0, fadeWidth, 0);
    edgeGradientL.addColorStop(0, isDark ? '#0F0D0B' : '#F5F3EE');
    edgeGradientL.addColorStop(1, 'transparent');
    ctx.fillStyle = edgeGradientL;
    ctx.fillRect(0, 0, fadeWidth, height);

    const edgeGradientR = ctx.createLinearGradient(width - fadeWidth, 0, width, 0);
    edgeGradientR.addColorStop(0, 'transparent');
    edgeGradientR.addColorStop(1, isDark ? '#0F0D0B' : '#F5F3EE');
    ctx.fillStyle = edgeGradientR;
    ctx.fillRect(width - fadeWidth, 0, fadeWidth, height);

    // Pulsing glow on today dot
    const todayIdx = points.length - 1;
    const tx = todayIdx * segmentWidth;
    const ty = points[todayIdx] === 1 ? midY - 6 : points[todayIdx] === 2 ? midY + 6 : midY;
    const pulse = Math.sin(Date.now() / 400) * 2 + 5;
    ctx.beginPath();
    ctx.arc(tx, ty, pulse + 2, 0, Math.PI * 2);
    ctx.fillStyle = points[todayIdx] === 1 ? 'rgba(46, 125, 94, 0.25)' : points[todayIdx] === 2 ? 'rgba(184, 74, 74, 0.25)' : 'rgba(168, 165, 160, 0.2)';
    ctx.fill();
};

/**
 * Refresh all stats panel visual sections (called on panel open)
 */
const refreshStatsPanel = () => {
    renderMilestoneRings();
    renderPersonalRecords();
    renderMonthlyPurity();
    renderAchievementBadges();
    renderPatternInsights();
    renderMastheadDistribution();
    drawSparkline();
    setTimeout(animateStatsCounters, 150);
};

// Smooth number counting animation
const animateValue = (obj, start, end, duration) => {
    if (start === end) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start).toString().padStart(obj.id === 'streak-val' ? 2 : 3, '0');
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
};

/**
 * Global Event Listeners
 */
const attachEventListeners = () => {
    resetBtn.addEventListener('click', () => {
        if(confirm("Are you sure you want to clear ALL tracked data for " + currentYear + "? This cannot be undone.")) {
            casesData = {};
            notesData = {};
            resetHistory = [];
            urgesData = {};
            achievements = { earned: [], earnedAt: {} };
            saveData();
            renderCalendar();
        }
    });

    // Auto-Fill Modal logic
    if (autofillCancelBtn) {
        autofillCancelBtn.addEventListener('click', () => {
            autofillModal.classList.remove('active');
            pendingAutofill = null;
        });
    }

    autofillModal.addEventListener('click', (e) => {
        if (e.target === autofillModal) {
            autofillModal.classList.remove('active');
            pendingAutofill = null;
        }
    });
    
    if (autofillConfirmBtn) {
        autofillConfirmBtn.addEventListener('click', () => {
            if (pendingAutofill && pendingAutofill.gapDates) {
                const dates = pendingAutofill.gapDates;
                const state = pendingAutofill.newState;
                let idx = 0;
                
                autofillModal.classList.remove('active');
                
                const fillInterval = setInterval(() => {
                    if (idx >= dates.length) {
                        clearInterval(fillInterval);
                        pendingAutofill = null;
                        saveData();
                        renderCalendar(); // Refresh streaks
                        return;
                    }
                    const d = dates[idx];
                    casesData[d] = state;
                    const cell = document.querySelector(`.day-cell[data-date="${d}"]`);
                    if (cell) {
                        cell.classList.remove('success', 'fail');
                        if (state === 1) cell.classList.add('success');
                        if (state === 2) cell.classList.add('fail');
                        
                        cell.classList.remove('animate-pop');
                        void cell.offsetWidth;
                        cell.classList.add('animate-pop');
                        
                        if (navigator.vibrate) navigator.vibrate(10);
                        playSound(state === 1 ? 'success' : 'fail');
                    }
                    idx++;
                }, 150);
            } else {
                autofillModal.classList.remove('active');
                pendingAutofill = null;
            }
        });
    }
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Don't trigger if user is typing in an input
        const tag = e.target.tagName;
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

        if (e.key === 'Escape') {
            e.preventDefault();
            closeAllOverlays();
            return;
        }

        // Single-key shortcuts (only when not typing)
        if (isInput) return;

        switch (e.key.toLowerCase()) {
            case 't':
            case 'j':
                e.preventDefault();
                closeAllOverlays();
                const todayCell = document.querySelector('.day-cell.today');
                if (todayCell) {
                    todayCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    todayCell.style.transition = 'box-shadow 0.3s, transform 0.3s';
                    todayCell.style.boxShadow = '0 0 0 4px var(--color-today)';
                    todayCell.style.transform = 'scale(1.3)';
                    setTimeout(() => {
                        todayCell.style.boxShadow = '';
                        todayCell.style.transform = '';
                    }, 800);
                }
                break;
            case 'n':
                e.preventDefault();
                const sidebarEl = document.getElementById('notes-sidebar');
                const overlayEl = document.getElementById('sidebar-overlay');
                const isOpen = sidebarEl && sidebarEl.classList.contains('active');
                closeAllOverlays();
                if (!isOpen && sidebarEl) {
                    sidebarEl.classList.add('active');
                    if (overlayEl) overlayEl.classList.add('active');
                    document.body.style.overflow = 'hidden';
                    updateBottomNav();
                }
                break;
            case 's':
                e.preventDefault();
                const sp = document.querySelector('.stats-panel');
                if (sp) {
                    const spOpen = sp.classList.contains('active');
                    closeAllOverlays();
                    if (!spOpen) {
                        sp.classList.add('active');
                        refreshStatsPanel();
                        sp.scrollTop = 0;
                        document.body.style.overflow = 'hidden';
                        updateBottomNav();
                    }
                }
                break;
            case 'p':
                e.preventDefault();
                posterConfig.openModal();
                break;
            case '?':
                e.preventDefault();
                const shortcuts = [
                    'KEYBOARD SHORTCUTS',
                    't / j → Jump to today',
                    'n → Toggle notes',
                    's → Toggle stats',
                    'p → Open poster export',
                    'Escape → Close all overlays',
                    '? → Show this help'
                ].join('\n');
                alert(shortcuts);
                break;
        }
    });
    
    modalCloseBtn.addEventListener('click', closeNoteModal);

    // Close note modal on backdrop click
    noteModal.addEventListener('click', (e) => {
        if (e.target === noteModal) closeNoteModal();
    });

    modalSaveBtn.addEventListener('click', saveNoteModal);
    
    // Universal X Close Listeners
    const statsXClose = document.getElementById('stats-x-close');
    const notesXClose = document.getElementById('notes-x-close');
    const modalXClose = document.getElementById('modal-x-close');
    const autofillXClose = document.getElementById('autofill-x-close');

    if (statsXClose) statsXClose.addEventListener('click', closeAllOverlays);
    if (notesXClose) notesXClose.addEventListener('click', closeAllOverlays);
    if (modalXClose) modalXClose.addEventListener('click', closeNoteModal);
    if (autofillXClose) {
        autofillXClose.addEventListener('click', () => {
            if (autofillModal) autofillModal.classList.remove('active');
            pendingAutofill = null;
        });
    }
    
    // Sidebar Overlay click to close
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            const sidebar = document.getElementById('notes-sidebar');
            if (sidebar) sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
            document.body.style.overflow = '';
            updateBottomNav();
        });
    }

    // Mobile "Log Today" inside Notes overlay
    const sidebarWriteBtn = document.getElementById('sidebar-write-btn');
    const sidebarSearch = document.getElementById('sidebar-search');
    const sidebarTagRail = document.getElementById('sidebar-tag-rail');
    const sidebarClearFilters = document.getElementById('sidebar-clear-filters');

    if (sidebarSearch) {
        sidebarSearch.addEventListener('input', (event) => {
            notesSearchQuery = event.target.value;
            renderSidebarNotes();
        });
    }

    if (sidebarTagRail) {
        sidebarTagRail.addEventListener('click', (event) => {
            const chip = event.target.closest('.sidebar-tag-chip');
            if (!chip) return;

            activeNotesTag = chip.dataset.tag || 'all';
            renderSidebarNotes();
        });
    }

    if (sidebarClearFilters) {
        sidebarClearFilters.addEventListener('click', () => {
            notesSearchQuery = '';
            activeNotesTag = 'all';
            if (sidebarSearch) sidebarSearch.value = '';
            renderSidebarNotes();
        });
    }

    if (sidebarWriteBtn) {
        sidebarWriteBtn.addEventListener('click', () => {
            if (navigator.vibrate) navigator.vibrate(20);
            
            // Note: Keep the sidebar state or close it? The user wants "X" to close sidebars.
            // Closing is usually cleaner when opening a modal.
            closeAllOverlays();
            
            activeNoteDate = todayStr;
            const todayDate = new Date();
            modalTitle.textContent = MONTHS[todayDate.getMonth()] + ' ' + todayDate.getDate() + ', ' + todayDate.getFullYear();
            noteTextarea.value = notesData[todayStr] || '';
            noteModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            setTimeout(() => noteTextarea.focus(), 100);
        });
    }

    // Note Suggestions logic
    const suggestionPills = document.querySelectorAll('.suggestion-pill');
    suggestionPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const value = pill.getAttribute('data-value');
            const currentText = noteTextarea.value;
            const prefix = (currentText && !currentText.endsWith(' ')) ? ' ' : '';
            
            noteTextarea.value = currentText + prefix + '#' + value + ' ';
            noteTextarea.focus();
            
            if (navigator.vibrate) navigator.vibrate(10);
        });
    });
    
    // Desktop Navigation Bar
    const navJumpToday = document.getElementById('nav-jump-today');
    const navToggleNotes = document.getElementById('nav-toggle-notes');
    const navToggleStats = document.getElementById('nav-toggle-stats');
    const navThemeToggle = document.getElementById('nav-theme-toggle');
    const navExportPoster = document.getElementById('nav-export-poster');
    
    if (navJumpToday) {
        navJumpToday.addEventListener('click', () => {
            const todayCell = document.querySelector('.day-cell.today');
            if (todayCell) {
                todayCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                todayCell.style.transition = 'box-shadow 0.3s, transform 0.3s';
                todayCell.style.boxShadow = '0 0 0 4px var(--color-today)';
                todayCell.style.transform = 'scale(1.3)';
                setTimeout(() => {
                    todayCell.style.boxShadow = '';
                    todayCell.style.transform = '';
                }, 800);
            }
        });
    }
    
    if (navToggleNotes) {
        navToggleNotes.addEventListener('click', () => {
            const sidebar = document.getElementById('notes-sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            if (sidebar) {
                const isActive = sidebar.classList.toggle('active');
                if (overlay) overlay.classList.toggle('active', isActive);
                if (isActive) {
                    document.body.style.overflow = 'hidden';
                } else {
                    document.body.style.overflow = '';
                }
                updateBottomNav();
            }
        });
    }
    
    if (navToggleStats) {
        navToggleStats.addEventListener('click', () => {
            const sp = document.querySelector('.stats-panel');
            if (sp) {
                const spOpen = sp.classList.contains('active');
                closeAllOverlays();
                if (!spOpen) {
                    sp.classList.add('active');
                    refreshStatsPanel();
                    sp.scrollTop = 0;
                    document.body.style.overflow = 'hidden';
                    updateBottomNav();
                }
            }
        });
    }

    if (navThemeToggle) {
        navThemeToggle.addEventListener('click', toggleTheme);
    }

    // Advanced Poster Configuration Controller
    const setupPosterConfig = () => {
        const modal = document.getElementById('poster-modal');
        const xBtn = document.getElementById('poster-x-close');
        const generateBtn = document.getElementById('poster-generate-btn');
        const previewCard = document.getElementById('poster-preview-card');
        const previewYear = previewCard ? previewCard.querySelector('.preview-year') : null;

        const includeStatsCheck = document.getElementById('config-include-stats');
        const includeNotesCheck = document.getElementById('config-include-notes');
        const includeLegendCheck = document.getElementById('config-include-legend');
        const includeUrgesCheck = document.getElementById('config-include-urges');

        const themeSegments = document.querySelectorAll('#config-theme-segments .segment-btn');
        const layoutSegments = document.querySelectorAll('#config-layout-segments .segment-btn');
        const formatSegments = document.querySelectorAll('#config-format-segments .segment-btn');
        const titleInput = document.getElementById('config-title');

        let currentTheme = 'archival';
        let currentLayout = 'standard';
        let currentFormat = 'png';

        const themeColorMap = {
            archival: ['#0F0D0B', '#EAE6DF', '#205E41', '#B84A4A'],
            gallery: ['#F8F6F1', '#1A1A1A', '#217346', '#A4262C'],
            solstice: ['#163020', '#D4AF37', '#D4AF37', '#C0392B'],
            midnight: ['#0B1120', '#C8D0E0', '#2E7D5E', '#B84A4A'],
            dawn: ['#F5E8D8', '#2C2418', '#6B8F5E', '#C05540'],
            noir: ['#0A0A0A', '#E8E8E8', '#FFFFFF', '#555555']
        };

        const updatePreview = () => {
            var colors = themeColorMap[currentTheme] || themeColorMap.archival;
            previewCard.style.background = colors[0];
            previewCard.style.color = colors[1];
            if (previewYear) previewYear.style.color = colors[1];
            previewCard.querySelectorAll('.p-dot.success').forEach(function(el) { el.style.background = colors[2]; });
            previewCard.querySelectorAll('.p-dot.fail').forEach(function(el) { el.style.background = colors[3]; });
            if (includeStatsCheck && !includeStatsCheck.checked) {
                previewCard.style.opacity = '0.5';
            } else {
                previewCard.style.opacity = '1';
            }
            var pStreak = previewCard.querySelector('.p-preview-streak');
            var pRate = previewCard.querySelector('.p-preview-rate');
            if (pStreak) pStreak.style.color = colors[1];
            if (pRate) pRate.style.color = colors[1];
        };

        const openModal = () => {
            var currentTitle = titleInput ? titleInput.value : '';
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            updatePreview();
        };

        const closeModal = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        };

        if (xBtn) xBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeModal();
        });

        var setupSegments = function(btns, callback) {
            btns.forEach(function(btn) {
                btn.addEventListener('click', function() {
                    btns.forEach(function(b) { b.classList.remove('active'); });
                    btn.classList.add('active');
                    callback(btn.dataset.value);
                });
            });
        };

        setupSegments(themeSegments, function(val) {
            currentTheme = val;
            updatePreview();
        });

        setupSegments(layoutSegments, function(val) {
            currentLayout = val;
            updatePreview();
        });

        setupSegments(formatSegments, function(val) {
            currentFormat = val;
        });

        [includeStatsCheck, includeNotesCheck, includeLegendCheck, includeUrgesCheck].forEach(function(chk) {
            if (chk) chk.addEventListener('change', updatePreview);
        });

        if (titleInput) {
            titleInput.addEventListener('input', updatePreview);
        }

        if (generateBtn) {
            generateBtn.addEventListener('click', function() {
                var options = {
                    theme: currentTheme,
                    layout: currentLayout,
                    format: currentFormat,
                    title: titleInput ? titleInput.value.trim() : '',
                    includeStats: includeStatsCheck ? includeStatsCheck.checked : true,
                    includeNotes: includeNotesCheck ? includeNotesCheck.checked : true,
                    includeLegend: includeLegendCheck ? includeLegendCheck.checked : true,
                    includeUrges: includeUrgesCheck ? includeUrgesCheck.checked : true
                };

                generateBtn.textContent = 'GENERATING...';
                generateBtn.disabled = true;

                document.fonts.ready.then(function() {
                    setTimeout(function() {
                        exportPoster(options);
                        generateBtn.textContent = 'GENERATE & DOWNLOAD';
                        generateBtn.disabled = false;
                        closeModal();
                    }, 300);
                });
            });
        }

        return { openModal };
    };

    const posterConfig = setupPosterConfig();
    const shareBtn = document.getElementById('share-btn');

    if (shareBtn) {
        shareBtn.addEventListener('click', function(e) {
            e.preventDefault();
            posterConfig.openModal();
        });
    }

    if (navExportPoster) {
        navExportPoster.addEventListener('click', function(e) {
            e.preventDefault();
            posterConfig.openModal();
        });
    }

    // ── New Modal Wiring ──

    // Mood picker buttons (inside urge modal)
    const moodOptions = document.getElementById('mood-options');
    if (moodOptions) {
        moodOptions.addEventListener('click', (e) => {
            const btn = e.target.closest('.mood-btn');
            if (!btn) return;
            moodOptions.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedMood = btn.dataset.mood;
        });
    }

    // Heatmap Modal
    const heatmapModal = document.getElementById('heatmap-modal');
    const heatmapXClose = document.getElementById('heatmap-x-close');
    const heatmapCloseBtn = document.getElementById('heatmap-close-btn');
    if (heatmapXClose || heatmapCloseBtn) {
        const closeHeatmap = () => {
            if (heatmapModal) heatmapModal.classList.remove('active');
        };
        if (heatmapXClose) heatmapXClose.addEventListener('click', closeHeatmap);
        if (heatmapCloseBtn) heatmapCloseBtn.addEventListener('click', closeHeatmap);
    }
    if (heatmapModal) {
        heatmapModal.addEventListener('click', (e) => {
            if (e.target === heatmapModal) heatmapModal.classList.remove('active');
        });
    }

    // Insights Modal
    const insightsModal = document.getElementById('insights-modal');
    const insightsXClose = document.getElementById('insights-x-close');
    const insightsCloseBtn = document.getElementById('insights-close-btn');
    if (insightsXClose || insightsCloseBtn) {
        const closeInsights = () => {
            if (insightsModal) insightsModal.classList.remove('active');
        };
        if (insightsXClose) insightsXClose.addEventListener('click', closeInsights);
        if (insightsCloseBtn) insightsCloseBtn.addEventListener('click', closeInsights);
    }
    if (insightsModal) {
        insightsModal.addEventListener('click', (e) => {
            if (e.target === insightsModal) insightsModal.classList.remove('active');
        });
    }

    // "View Urge Heatmap" and "View Pattern Details" links in insights panel
    const insightsCard2 = document.getElementById('insights-card');
    if (insightsCard2) {
        const heatmapLink = document.createElement('button');
        heatmapLink.className = 'trend-link text-btn';
        heatmapLink.textContent = 'View Urge Heatmap';
        heatmapLink.style.marginRight = 'var(--sp-xs)';
        heatmapLink.addEventListener('click', () => {
            drawHeatmap();
            if (heatmapModal) {
                closeAllOverlays();
                heatmapModal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
        insightsCard2.appendChild(heatmapLink);

        const patternsLink = document.createElement('button');
        patternsLink.className = 'trend-link text-btn';
        patternsLink.textContent = 'View Pattern Details';
        patternsLink.addEventListener('click', () => {
            renderInsightsModal();
            if (insightsModal) {
                closeAllOverlays();
                insightsModal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
        insightsCard2.appendChild(patternsLink);
    }

    // Bottom nav urge button
    const bnavUrge = document.getElementById('bnav-urge');
    if (bnavUrge) {
        bnavUrge.addEventListener('click', () => {
            const todayUrgeStr = formatDateStr(new Date());
            showUrgeModal(todayUrgeStr);
        });
    }

    // Trigger Tag Modal
    const triggerModal = document.getElementById('trigger-modal');
    const triggerXClose = document.getElementById('trigger-x-close');
    const triggerSkipBtn = document.getElementById('trigger-skip-btn');
    const triggerConfirmBtn = document.getElementById('trigger-confirm-btn');
    const triggerSelectionGrid = document.getElementById('trigger-selection-grid');

    if (triggerXClose) triggerXClose.addEventListener('click', closeTriggerModal);
    if (triggerSkipBtn) triggerSkipBtn.addEventListener('click', () => saveTriggerTag(''));
    if (triggerModal) {
        triggerModal.addEventListener('click', (e) => {
            if (e.target === triggerModal) closeTriggerModal();
        });
    }
    if (triggerConfirmBtn) {
        triggerConfirmBtn.addEventListener('click', () => {
            const active = triggerSelectionGrid ? triggerSelectionGrid.querySelector('.trigger-chip.active') : null;
            saveTriggerTag(active ? active.dataset.value : '');
        });
    }
    if (triggerSelectionGrid) {
        triggerSelectionGrid.addEventListener('click', (e) => {
            const chip = e.target.closest('.trigger-chip');
            if (!chip) return;
            triggerSelectionGrid.querySelectorAll('.trigger-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        });
    }

    // Urge Log Modal
    const urgeModal = document.getElementById('urge-modal');
    const urgeXClose = document.getElementById('urge-x-close');
    const urgeSaveBtn = document.getElementById('urge-save-btn');
    const urgeTriggerGrid = document.getElementById('urge-trigger-grid');

    if (urgeXClose) urgeXClose.addEventListener('click', closeUrgeModal);
    if (urgeSaveBtn) urgeSaveBtn.addEventListener('click', saveUrgeLog);
    if (urgeModal) {
        urgeModal.addEventListener('click', (e) => {
            if (e.target === urgeModal) closeUrgeModal();
        });
    }
    if (urgeTriggerGrid) {
        urgeTriggerGrid.addEventListener('click', (e) => {
            const chip = e.target.closest('.trigger-chip');
            if (!chip) return;
            urgeTriggerGrid.querySelectorAll('.trigger-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            selectedUrgeTrigger = chip.dataset.value;
        });
    }

    // Trend View Modal
    const trendModal = document.getElementById('trend-modal');
    const trendXClose = document.getElementById('trend-x-close');
    if (trendXClose) trendXClose.addEventListener('click', () => {
        if (trendModal) trendModal.classList.remove('active');
    });
    if (trendModal) {
        trendModal.addEventListener('click', (e) => {
            if (e.target === trendModal) {
                trendModal.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // Trend View button inside insights (add a "View Streak History" link)
    const insightsCard = document.getElementById('insights-card');
    if (insightsCard) {
        const trendLink = document.createElement('button');
        trendLink.className = 'trend-link text-btn';
        trendLink.textContent = 'View Streak History';
        trendLink.addEventListener('click', () => {
            drawTrend();
            if (trendModal) {
                closeAllOverlays();
                trendModal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
        insightsCard.appendChild(trendLink);
    }

    // Right-click (contextmenu) on day cells for urge logging (desktop)
    document.addEventListener('contextmenu', (e) => {
        const cell = e.target.closest('.day-cell:not(.empty)');
        if (!cell) return;
        e.preventDefault();
        const dateStr = cell.getAttribute('data-date');
        if (dateStr) showUrgeModal(dateStr);
    });

    // Bottom Navigation Bar actions
    const bnavToday = document.getElementById('bnav-today');
    const bnavStats = document.getElementById('bnav-stats');
    const bnavNote = document.getElementById('bnav-note');
    const bnavTop = document.getElementById('bnav-top');
    
    if (bnavToday) {
        bnavToday.addEventListener('click', () => {
            closeAllOverlays();
            const todayCell = document.querySelector('.day-cell.today');
            if (todayCell) {
                todayCell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                todayCell.style.transition = 'box-shadow 0.3s, transform 0.3s';
                todayCell.style.boxShadow = '0 0 0 4px var(--color-today)';
                todayCell.style.transform = 'scale(1.3)';
                setTimeout(() => {
                    todayCell.style.boxShadow = '';
                    todayCell.style.transform = '';
                }, 800);
            }
        });
    }
    
    if (bnavStats) {
        bnavStats.addEventListener('click', () => {
            closeAllOverlays();
            statsPanel.classList.add('active');
            refreshStatsPanel();
            statsPanel.scrollTop = 0;
            if (navigator.vibrate) navigator.vibrate(20);
            document.body.style.overflow = 'hidden';
            updateBottomNav();
        });
    }
    
    if (bnavNote) {
        bnavNote.addEventListener('click', () => {
            closeAllOverlays();
            const sidebar = document.getElementById('notes-sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            if (sidebar) {
                sidebar.classList.add('active');
                if (overlay) overlay.classList.add('active');
                if (navigator.vibrate) navigator.vibrate(20);
                document.body.style.overflow = 'hidden';
                updateBottomNav();
            }
        });
    }
    
    if (bnavTop) {
        bnavTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Premium: Swipe-to-Dismiss for Bottom Sheets (Mobile)
    const setupSwipeDismiss = (element, onDismiss) => {
        let startY = 0;
        let currentY = 0;
        let isDraggingSheet = false;
        const threshold = 80;
        const maxDrag = 200;

        const onTouchStart = (e) => {
            const touch = e.touches[0];
            startY = touch.clientY;
            isDraggingSheet = true;
            element.style.transition = 'none';
        };

        const onTouchMove = (e) => {
            if (!isDraggingSheet) return;
            const touch = e.touches[0];
            currentY = touch.clientY;
            const delta = currentY - startY;
            if (delta > 0) {
                e.preventDefault();
                const translate = Math.min(delta, maxDrag);
                const scale = 1 - (translate / maxDrag) * 0.05;
                element.style.transform = `translateY(${translate}px) scale(${scale})`;
                element.style.opacity = 1 - (translate / maxDrag) * 0.4;
            }
        };

        const onTouchEnd = () => {
            if (!isDraggingSheet) return;
            isDraggingSheet = false;
            const delta = currentY - startY;
            element.style.transition = '';
            element.style.transform = '';
            element.style.opacity = '';
            if (delta > threshold) {
                if (onDismiss) onDismiss();
            }
            startY = 0;
            currentY = 0;
        };

        element.addEventListener('touchstart', onTouchStart, { passive: true });
        element.addEventListener('touchmove', onTouchMove, { passive: false });
        element.addEventListener('touchend', onTouchEnd);
    };

    // Apply swipe-dismiss to note modal (mobile only)
    const marginModal = document.querySelector('.margin-modal');
    if (marginModal && window.innerWidth < 768) {
        setupSwipeDismiss(marginModal, () => {
            closeNoteModal();
        });
    }

    // Apply swipe-dismiss to stats panel (mobile)
    if (statsPanel && window.innerWidth < 768) {
        setupSwipeDismiss(statsPanel, () => {
            closeAllOverlays();
        });
    }

    // Apply swipe-dismiss to notes sidebar
    const notesSidebarEl = document.getElementById('notes-sidebar');
    if (notesSidebarEl && window.innerWidth < 768) {
        setupSwipeDismiss(notesSidebarEl, () => {
            const sidebar = document.getElementById('notes-sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            if (sidebar) sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
            document.body.style.overflow = '';
            updateBottomNav();
        });
    }

    // Premium: Ripple class + coordinate tracking on interactive elements
    document.querySelectorAll('.bnav-item, .text-btn, .modal-btn, .suggestion-pill, .sidebar-tag-chip, .segment-btn, .onboarding-next-btn, .onboarding-start-btn, .sidebar-fab, .trigger-chip, .intensity-dot, .trend-link').forEach(el => {
        el.classList.add('ripple');
    });

    document.addEventListener('pointerdown', (e) => {
        const target = e.target.closest('.day-cell:not(.empty), .ripple');
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        target.style.setProperty('--rx', x + '%');
        target.style.setProperty('--ry', y + '%');
    });

    // Global Pointer Up listener to finalize batch dragging
    document.addEventListener('pointerup', () => {
        if (isDragging) {
            const shouldAutoFill = dragVisitedCount === 1 && (lastChangedState === 1 || lastChangedState === 2);
            const changedDate = lastChangedDate;
            const changedState = lastChangedState;

            isDragging = false;
            dragState = null;
            dragVisitedCount = 0;
            saveData();

            if (shouldAutoFill && changedDate) {
                tryAutoFill(changedDate, changedState);
            }

            // Handle drag-painted fails: record reset for each unique fail
            if (dragFailDates.size > 0) {
                const failDates = [...dragFailDates];
                dragFailDates.clear();
                failDates.forEach((fd, idx) => {
                    recordReset(fd);
                    // Show trigger modal for the last fail in the drag
                    if (idx === failDates.length - 1) {
                        showTriggerModal(fd);
                    }
                });
            }
        }
    });
    
    // Safety catch to cancel drag if pointer leaves document
    document.addEventListener('pointercancel', () => {
        isDragging = false;
        dragState = null;
        dragVisitedCount = 0;
        dragFailDates.clear();
    });

    setupPWAElite(); // Elite PWA Initialization
};

// Start Apps
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
