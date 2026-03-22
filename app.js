/**
 * CAL // 365
 * Main Application Logic
 * Vanilla JS | No dependencies
 */

const LOCAL_STORAGE_KEY = 'cal_cases_data';
const THEME_STORAGE_KEY = 'cal_theme_pref';
const NOTES_STORAGE_KEY = 'cal_notes_data';

// App State Cache
let casesData = {};
let notesData = {};
let currentYear = new Date().getFullYear();
let notesSearchQuery = '';
let activeNotesTag = 'all';

// Undo System (single-level snapshot)
let undoSnapshot = null;

// Batch Drag State
let isDragging = false;
let dragState = null; // 0, 1, or 2
let dragVisitedCount = 0;
let lastChangedDate = null;
let lastChangedState = null;

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
const exportBtn = document.getElementById('export-btn');
const importFile = document.getElementById('import-file');
const bestStreakVal = document.getElementById('best-streak-val');

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

// Pending Auto-Fill State
let pendingAutofill = null; // { gapDates: [], newState: 1|2 }

// Mobile Menu
const mobileToggle = document.getElementById('mobile-menu-toggle');
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
    
    // Haptics if available
    if (navigator.vibrate) {
        if (type === 'success') navigator.vibrate(50);
        else if (type === 'fail') navigator.vibrate([30, 50, 30]);
        else navigator.vibrate(20);
    }
};

// Constants
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
    const navThemeToggle = document.getElementById('nav-theme-toggle');
    if (navThemeToggle) {
        navThemeToggle.textContent = getThemeToggleLabel(theme);
    }
};

const loadTheme = () => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    syncThemeToggleLabels(savedTheme);
};

const toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    syncThemeToggleLabels(newTheme);
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
    attachEventListeners();
    
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
            else if (mobileToggle) mobileToggle.click();
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
    const status = document.getElementById('sidebar-filter-status');
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
            <p>No inscriptions yet.</p>
            <p class="sidebar-hint">Double-click any day to leave a thought.</p>
        `;
        empty.style.display = 'block';
        return;
    }

    if (filteredEntries.length === 0) {
        empty.innerHTML = `
            <p>No notes match this filter.</p>
            <p class="sidebar-hint">Try another phrase or clear the active tag.</p>
        `;
        empty.style.display = 'block';
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
    
    if (savedCases) {
        try { casesData = JSON.parse(savedCases); } catch (e) { casesData = {}; }
    } else { casesData = {}; }

    if (savedNotes) {
        try { notesData = JSON.parse(savedNotes); } catch (e) { notesData = {}; }
    } else { notesData = {}; }
};

const saveData = () => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(casesData));
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notesData));
    updateStats();
    drawSparkline();
    renderCalendar();
    renderSidebarNotes();
};

/**
 * NATIVE SHARE API
 */
const shareProgress = async () => {
    const stats = calculateStatsValues(); // Helper to get current values
    const text = `I've reached a ${stats.currentStreak} day streak of being clean! Total days clean: ${stats.successCount}. Tracked via The Daily Tracker.`;
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'The Daily Tracker // Progress Report',
                text: text,
                url: window.location.origin
            });
        } catch (err) {
            console.log('Share failed', err);
        }
    } else {
        // Fallback: Copy to clipboard
        navigator.clipboard.writeText(text);
        alert('Progress copied to clipboard!');
    }
};

const calculateStatsValues = () => {
    let successCount = 0;
    for (const date in casesData) {
        if (casesData[date] === 1) successCount++;
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
    return { successCount, currentStreak };
};

/**
 * Data Export & Import
 */
const exportData = () => {
    const exportObject = {
        cases: casesData,
        notes: notesData
    };
    const dataStr = JSON.stringify(exportObject, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `cal_365_${currentYear}_data.json`;
    a.click();
    
    URL.revokeObjectURL(url);
};

const importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (typeof parsed === 'object') {
                if (parsed.cases) {
                    // New format
                    casesData = { ...casesData, ...parsed.cases };
                    notesData = { ...notesData, ...parsed.notes };
                } else {
                    // Old format (just cases)
                    casesData = { ...casesData, ...parsed };
                }
                saveData();
                renderCalendar();
                alert('Data successfully imported.');
            } else {
                alert('Invalid JSON structure.');
            }
        } catch (err) {
            console.error('Import error', err);
            alert('Failed to parse JSON file.');
        }
    };
    reader.readAsText(file);
    
    // reset input
    event.target.value = '';
};


/**
 * Canvas Poster Generation
 */
/**
 * Canvas Poster Generation (Refactored for Advanced Options)
 */
const exportPoster = (options = {}) => {
    // Default options
    const config = {
        theme: options.theme || 'archival',
        includeStats: options.includeStats !== undefined ? options.includeStats : true,
        includeNotes: options.includeNotes !== undefined ? options.includeNotes : true,
        includeLegend: options.includeLegend !== undefined ? options.includeLegend : true,
        layout: 'standard' 
    };

    const pCanvas = document.getElementById('poster-canvas');
    if (!pCanvas) return;
    
    // Set for high-res A4 paper proportions
    const width = 2480; 
    const height = 3508;
    pCanvas.width = width;
    pCanvas.height = height;
    
    const pCtx = pCanvas.getContext('2d');
    
    // Theming profiles
    const themes = {
        archival: {
            bg: '#181716', text: '#EAE6DF', dim: '#88837C', border: '#2F2E2C',
            success: '#205E41', fail: '#D64235', neutral: '#242220'
        },
        gallery: {
            bg: '#FFFFFF', text: '#1A1A1A', dim: '#999999', border: '#EEEEEE',
            success: '#217346', fail: '#A4262C', neutral: '#F3F2F1'
        },
        solstice: {
            bg: '#163020', text: '#D4AF37', dim: '#8F9779', border: '#2D4B37',
            success: '#D4AF37', fail: '#C0392B', neutral: '#1F402B'
        }
    };

    const t = themes[config.theme] || themes.archival;

    // 1. Fill Background
    pCtx.fillStyle = t.bg;
    pCtx.fillRect(0, 0, width, height);
    
    // 2. Add subtle texture (noise simulation)
    const noiseCv = document.createElement('canvas');
    noiseCv.width = 100; noiseCv.height = 100;
    const nCtx = noiseCv.getContext('2d');
    for(let i=0; i<100; i++) {
        for(let j=0; j<100; j++) {
            if(Math.random() > 0.95) {
                nCtx.fillStyle = config.theme === 'gallery' ? 'rgba(0,0,0, 0.02)' : 'rgba(255,255,255, 0.03)';
                nCtx.fillRect(i, j, 1, 1);
            }
        }
    }
    const noisePattern = pCtx.createPattern(noiseCv, 'repeat');
    pCtx.fillStyle = noisePattern;
    pCtx.fillRect(0, 0, width, height);

    // 3. Draw Header
    const marginX = 200;
    let cursorY = 300;
    
    pCtx.font = '500 32px Epilogue, sans-serif';
    pCtx.fillStyle = t.dim;
    pCtx.fillText('A DAILY RECORD', marginX, cursorY);
    
    cursorY += 150;
    
    pCtx.font = 'italic 400 120px "Instrument Serif", serif';
    pCtx.fillStyle = t.dim;
    pCtx.fillText('NO.', marginX, cursorY);
    
    pCtx.font = '400 400px "Instrument Serif", serif';
    pCtx.fillStyle = t.text;
    pCtx.fillText(currentYear.toString(), marginX + 220, cursorY + 40);
    
    // Line separator
    cursorY += 150;
    pCtx.beginPath();
    pCtx.moveTo(marginX, cursorY);
    pCtx.lineTo(width - marginX, cursorY);
    pCtx.strokeStyle = t.border;
    pCtx.lineWidth = 2;
    pCtx.stroke();
    
    // 4. Draw Calendar Layout
    cursorY += 200;
    
    const cols = 3;
    const colSpacing = 120;
    const cw = (width - (marginX * 2) - (colSpacing * (cols - 1))) / cols; 
    
    MONTHS.forEach((monthName, mIndex) => {
        const row = Math.floor(mIndex / cols);
        const col = mIndex % cols;
        const mBaseX = marginX + (col * (cw + colSpacing));
        const mBaseY = cursorY + (row * 600);
        
        // Month Header
        pCtx.font = 'italic 400 80px "Instrument Serif", serif';
        pCtx.fillStyle = t.text;
        pCtx.fillText(monthName, mBaseX, mBaseY);
        
        const rmText = `ARCHIVE NO. ${(mIndex+1).toString().padStart(2, '0')}`;
        pCtx.font = '400 24px Epilogue, sans-serif';
        pCtx.fillStyle = t.dim;
        pCtx.fillText(rmText, mBaseX + cw - pCtx.measureText(rmText).width, mBaseY);
        
        // Day Grid (7 columns)
        const cellGap = 12;
        const dw = (cw - (cellGap * 6)) / 7;
        const gridYStart = mBaseY + 60;
        
        const daysInMonth = new Date(currentYear, mIndex + 1, 0).getDate();
        const firstDay = getFirstDayOfMonth(mIndex, currentYear);
        const cellSpace = cw / 7;

        pCtx.font = '500 22px Epilogue, sans-serif';
        pCtx.textAlign = 'center';

        for (let i = 0; i < 42; i++) { // Max cells in a month calendar
            const gridRow = Math.floor(i / 7);
            const gridCol = i % 7;
            const cellX = mBaseX + (gridCol * cellSpace) + (cellSpace / 2);
            const cellY = gridYStart + (gridRow * cellSpace) + (cellSpace / 2);
            
            if (i >= firstDay && i < firstDay + daysInMonth) {
                const dayNum = i - firstDay + 1;
                const dateStr = `${currentYear}-${(mIndex+1).toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
                const state = casesData[dateStr] || 0;
                
                pCtx.beginPath();
                pCtx.arc(cellX, cellY, dw/2, 0, Math.PI * 2);
                
                if (state === 1) pCtx.fillStyle = t.success;
                else if (state === 2) pCtx.fillStyle = t.fail;
                else pCtx.fillStyle = t.neutral;
                
                pCtx.fill();

                // Note Indicator
                if (config.includeNotes && notesData[dateStr]) {
                    pCtx.beginPath();
                    pCtx.arc(cellX + dw/2 - 5, cellY - dw/2 + 5, 4, 0, Math.PI * 2);
                    pCtx.fillStyle = (state === 1 || state === 2) ? '#fff' : t.dim;
                    pCtx.fill();
                }
            }
        }
        pCtx.textAlign = 'left';
    });

    // 5. Draw Info / Legend
    if (config.includeLegend) {
        let lx = marginX;
        let ly = height - 300;
        
        pCtx.font = '500 24px Epilogue, sans-serif';
        pCtx.fillStyle = t.dim;
        pCtx.fillText('LEGEND', lx, ly - 40);
        
        const items = [
            { label: 'CLEAN', color: t.success },
            { label: 'RELAPSE', color: t.fail },
            { label: 'NEUTRAL', color: t.neutral }
        ];
        
        items.forEach(item => {
            pCtx.beginPath();
            pCtx.arc(lx + 10, ly + 10, 10, 0, Math.PI * 2);
            pCtx.fillStyle = item.color;
            pCtx.fill();
            
            pCtx.fillStyle = t.text;
            pCtx.font = '600 20px Epilogue, sans-serif';
            pCtx.fillText(item.label, lx + 40, ly + 18);
            lx += 250;
        });
    }

    // 6. Draw Summary Statistics
    if (config.includeStats) {
        const statsValues = calculateStatsValues(); 
        const bestStreakEl = document.getElementById('best-streak-val');
        const bestStr = bestStreakEl ? bestStreakEl.textContent : '0';

        let sx = width - marginX - 550;
        let sy = height - 450;

        pCtx.font = 'italic 400 60px "Instrument Serif", serif';
        pCtx.fillStyle = t.text;
        pCtx.fillText(`${bestStr} DAYS UNBROKEN`, sx, sy);
        
        sy += 80;
        pCtx.font = '500 24px Epilogue, sans-serif';
        pCtx.fillStyle = t.dim;
        pCtx.fillText(`TOTAL CLEAN: ${statsValues.successCount}`, sx, sy);
        
        sy += 40;
        const winRate = statsValues.totalInputs > 0 ? (statsValues.successCount / statsValues.totalInputs * 100).toFixed(1) : '0';
        pCtx.fillText(`SUCCESS RATE: ${winRate}%`, sx, sy);
    }

    // 7. Colophon
    pCtx.font = 'italic 400 32px "Instrument Serif", serif';
    pCtx.fillStyle = t.dim;
    const colophonText = `GENERATED ON THE ARCHIVAL RECORD OF ${currentYear}.`;
    pCtx.fillText(colophonText, marginX, height - 100);

    // Save and download using Blob for better compatibility
    pCanvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `archive_record_${currentYear}_${config.theme}.png`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    }, 'image/png', 1.0);
};

/**
 * Handle clicking or dragging over a day cell
 */
const handleDayInteraction = (cell, isPointerDown = false) => {
    if (cell.classList.contains('empty')) return;

    const dateStr = cell.getAttribute('data-date');
    if (!dateStr) return;

    // Only snapshot undo on the initial click
    if (isPointerDown) {
        undoSnapshot = JSON.parse(JSON.stringify(casesData));
    }

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
        cell.classList.remove('success', 'fail');
        if (isPointerDown) playSound('neutral');
    } else if (newState === 1) {
        casesData[dateStr] = 1;
        cell.classList.remove('fail');
        cell.classList.add('success');
        if (isPointerDown) playSound('success');
    } else if (newState === 2) {
        casesData[dateStr] = 2;
        cell.classList.remove('success');
        cell.classList.add('fail');
        if (isPointerDown) playSound('fail');
    }

    // Apply animation
    cell.classList.remove('animate-pop');
    void cell.offsetWidth; // Reflow
    cell.classList.add('animate-pop');
    setTimeout(() => cell.classList.remove('animate-pop'), 500);

    // If it was a single click (not a drag), save immediately.
    // Otherwise, we wait for the global pointerup event to save performance.
    if (isPointerDown && !isDragging) {
        saveData();
        if (newState === 1 || newState === 2) {
            tryAutoFill(dateStr, newState);
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
 * UNDO LAST ACTION
 */
const undoLastAction = () => {
    if (!undoSnapshot) return;
    casesData = undoSnapshot;
    undoSnapshot = null;
    saveData();
    renderCalendar();
};

/**
 * Handle Margin Note Modal
 */
const openNoteModal = (e) => {
    const cell = e.target;
    if (cell.classList.contains('empty')) return;
    
    activeNoteDate = cell.getAttribute('data-date');
    if (!activeNoteDate) return;

    const dateObj = new Date(activeNoteDate);
    // Fix offset
    dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
    
    modalTitle.textContent = `${MONTHS[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;
    noteTextarea.value = notesData[activeNoteDate] || '';
    
    noteModal.classList.add('active');
    setTimeout(() => noteTextarea.focus(), 100);
};

const closeNoteModal = () => {
    if (noteModal) noteModal.classList.remove('active');
    activeNoteDate = null;
    // Don't restore overflow if another overlay is active
    const statsPanel = document.querySelector('.stats-panel');
    const sidebar = document.getElementById('notes-sidebar');
    if (!statsPanel.classList.contains('active') && !sidebar.classList.contains('active')) {
        document.body.style.overflow = '';
    }
};

const closeAllOverlays = () => {
    const statsPanel = document.querySelector('.stats-panel');
    if (statsPanel) statsPanel.classList.remove('active');
    const sidebar = document.getElementById('notes-sidebar');
    if (sidebar) sidebar.classList.remove('active');
    if (noteModal) noteModal.classList.remove('active');
    if (autofillModal) autofillModal.classList.remove('active');
    document.body.style.overflow = '';
    activeNoteDate = null;
    pendingAutofill = null;
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
                // Pointer Events for Batch Dragging (mouse/pen only)
                cell.addEventListener('pointerdown', (e) => {
                    // On touch devices, skip drag-painting to preserve scrolling
                    if (e.pointerType === 'touch') {
                        // Single tap marking only — no drag
                        handleDayInteraction(cell, true);
                        return;
                    }
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

                // Double tap for notes
                cell.addEventListener('dblclick', openNoteModal);
                
                // Mobile double-tap detection
                let lastTap = 0;
                cell.addEventListener('touchend', (e) => {
                    const currentTime = new Date().getTime();
                    const tapLength = currentTime - lastTap;
                    if (tapLength < 300 && tapLength > 0) {
                        e.preventDefault(); // Prevent zoom or click
                        openNoteModal(e);
                    }
                    lastTap = currentTime;
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
    
    // Sort all tracked dates chronologically to find streaks across the history
    const allDates = Object.keys(casesData).sort((a,b) => new Date(a) - new Date(b));
    let lastDate = null;
    
    // Day of Week tracking: 0=Sun, 1=Mon, ..., 6=Sat
    const dayStats = { 0: {s:0, f:0, t:0}, 1: {s:0, f:0, t:0}, 2: {s:0, f:0, t:0}, 3: {s:0, f:0, t:0}, 4: {s:0, f:0, t:0}, 5: {s:0, f:0, t:0}, 6: {s:0, f:0, t:0} };

    for (const dStr of allDates) {
        const state = casesData[dStr];
        const dObj = new Date(dStr);
        dObj.setMinutes(dObj.getMinutes() + dObj.getTimezoneOffset());
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
            
            // We'll show the higher of the two, or both very minimally
            const dominantState = sPct >= fPct ? 'success' : 'fail';
            const pctVal = sPct >= fPct ? sPct : fPct;
            
            dayCol.innerHTML = `
                <span class="dist-day">${dayNames[i]}</span>
                <span class="dist-val ${dominantState}">${pctVal}%</span>
                <div class="dist-bar-bg">
                    <div class="dist-bar ${dominantState}" style="height: ${Math.max(pctVal, 2)}%"></div>
                </div>
            `;
            distGrid.appendChild(dayCol);
        }
    }

    // Animate numbers up
    animateValue(successVal, parseInt(successVal.textContent), successCount, 300);
    animateValue(failVal, parseInt(failVal.textContent), failCount, 300);
    animateValue(streakVal, parseInt(streakVal.textContent), currentStreak, 300);
    animateValue(bestStreakVal, parseInt(bestStreakVal.textContent), bestStreak, 300);

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

    const daysToLookBack = 30;
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
    
    // Draw dots
    points.forEach((state, i) => {
        const x = i * segmentWidth;
        let y = midY;
        let radius = 1.5;
        let color = lineColor;
        
        if (state === 1) {
            y = midY - 6; // pop up
            color = successColor;
            radius = 2.5;
        } else if (state === 2) {
            y = midY + 6; // dip down
            color = failColor;
            radius = 2.5;
        }
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    });
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
            saveData();
            renderCalendar();
        }
    });

    exportBtn.addEventListener('click', exportData);
    
    // Auto-Fill Modal logic
    if (autofillCancelBtn) {
        autofillCancelBtn.addEventListener('click', () => {
            autofillModal.classList.remove('active');
            pendingAutofill = null;
        });
    }
    
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
    importFile.addEventListener('change', importData);
    
    // Advanced PWA: Share Progress
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) shareBtn.addEventListener('click', shareProgress);
    
    // Undo button
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.addEventListener('click', undoLastAction);
    
    // Keyboard shortcut: Ctrl+Z for undo
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            undoLastAction();
        }
    });
    
    modalCloseBtn.addEventListener('click', closeNoteModal);
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

    // Mobile menu logic (3-bar toggle - ONLY OPENS STATS)
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            const isActive = statsPanel.classList.contains('active');
            if (isActive) {
                closeAllOverlays();
            } else {
                closeAllOverlays(); // Safety
                statsPanel.classList.add('active');
                if (navigator.vibrate) navigator.vibrate(20);
                document.body.style.overflow = 'hidden';
            }
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
    const navThemeToggle = document.getElementById('nav-theme-toggle');
    const navExportPoster = document.getElementById('nav-export-poster');
    
    if (navJumpToday) {
        navJumpToday.addEventListener('click', (e) => {
            e.preventDefault();
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
        navToggleNotes.addEventListener('click', (e) => {
            e.preventDefault();
            const sidebar = document.getElementById('notes-sidebar');
            if (sidebar) {
                sidebar.classList.toggle('active');
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
        
        const includeStatsCheck = document.getElementById('config-include-stats');
        const includeNotesCheck = document.getElementById('config-include-notes');
        const includeLegendCheck = document.getElementById('config-include-legend');
        const themeSegments = document.querySelectorAll('#config-theme-segments .segment-btn');

        let currentTheme = 'archival';

        const updatePreview = () => {
            if (!includeStatsCheck.checked) {
                previewCard.classList.add('config-include-stats-hidden');
            } else {
                previewCard.classList.remove('config-include-stats-hidden');
            }

            previewCard.classList.remove('theme-gallery', 'theme-solstice');
            if (currentTheme === 'gallery') previewCard.classList.add('theme-gallery');
            if (currentTheme === 'solstice') previewCard.classList.add('theme-solstice');
        };

        const openModal = () => {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            updatePreview();
        };

        const closeModal = () => {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        };

        if (xBtn) xBtn.addEventListener('click', closeModal);
        
        themeSegments.forEach(btn => {
            btn.addEventListener('click', () => {
                themeSegments.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTheme = btn.dataset.value;
                updatePreview();
            });
        });

        [includeStatsCheck, includeNotesCheck, includeLegendCheck].forEach(chk => {
            if (chk) chk.addEventListener('change', updatePreview);
        });

        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                const options = {
                    theme: currentTheme,
                    includeStats: includeStatsCheck.checked,
                    includeNotes: includeNotesCheck.checked,
                    includeLegend: includeLegendCheck.checked
                };
                
                generateBtn.textContent = 'GENERATING ARCHIVE...';
                generateBtn.disabled = true;

                setTimeout(() => {
                    exportPoster(options);
                    generateBtn.textContent = 'GENERATE & DOWNLOAD';
                    generateBtn.disabled = false;
                    closeModal();
                }, 500);
            });
        }

        return { openModal };
    };

    const posterConfig = setupPosterConfig();

    if (navExportPoster) {
        navExportPoster.addEventListener('click', (e) => {
            e.preventDefault();
            posterConfig.openModal();
        });
    }

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
            if (navigator.vibrate) navigator.vibrate(20);
            document.body.style.overflow = 'hidden';
        });
    }
    
    if (bnavNote) {
        bnavNote.addEventListener('click', () => {
            closeAllOverlays();
            const sidebar = document.getElementById('notes-sidebar');
            if (sidebar) {
                sidebar.classList.add('active');
                if (navigator.vibrate) navigator.vibrate(20);
                document.body.style.overflow = 'hidden';
            }
        });
    }
    
    if (bnavTop) {
        bnavTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

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
        }
    });
    
    // Safety catch to cancel drag if pointer leaves document
    document.addEventListener('pointercancel', () => {
        isDragging = false;
        dragState = null;
        dragVisitedCount = 0;
    });
};

// Start Apps
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
