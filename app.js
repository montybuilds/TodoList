/**
 * TaskFlow - Smart & Elegant Todo Application
 * Pure Vanilla JavaScript with LocalStorage Persistence
 */

(function () {
  'use strict';

  // --- Constants & Keys ---
  const STORAGE_KEY = 'taskflow_todos_v1';
  const SETTINGS_KEY = 'taskflow_settings_v1';

  // Initial demo tasks if user has an empty localStorage
  const INITIAL_TASKS = [
    {
      id: 'task-1',
      title: 'Welcome to TaskFlow! 🚀',
      priority: 'high',
      category: 'General',
      dueDate: getRelativeDateString(0), // Today
      completed: false,
      createdAt: Date.now() - 3600000
    },
    {
      id: 'task-2',
      title: 'Tap the checkbox to complete a task and hear audio feedback 🎵',
      priority: 'normal',
      category: 'Ideas',
      dueDate: getRelativeDateString(1), // Tomorrow
      completed: false,
      createdAt: Date.now() - 1800000
    },
    {
      id: 'task-3',
      title: 'Review urgent tasks and prioritize your day 🎯',
      priority: 'urgent',
      category: 'Work',
      dueDate: getRelativeDateString(-1), // Yesterday (overdue test)
      completed: false,
      createdAt: Date.now() - 900000
    }
  ];

  // Helper to format date offset in YYYY-MM-DD
  function getRelativeDateString(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().split('T')[0];
  }

  // --- State ---
  let state = {
    tasks: [],
    filter: 'all', // 'all' | 'active' | 'completed' | 'urgent'
    searchQuery: '',
    sortBy: 'createdAt-desc',
    soundEnabled: true
  };

  // Last deleted task for undo capability
  let lastDeletedTask = null;
  let undoTimeoutId = null;

  // --- Audio Synthesis via Web Audio API (Zero dependencies) ---
  let audioCtx = null;

  function initAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
  }

  function playSound(type) {
    if (!state.soundEnabled) return;
    try {
      initAudioContext();
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'complete') {
        // Cheerful high dual chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'add') {
        // Soft click/pop
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(560, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.13);
      } else if (type === 'delete') {
        // Soft drop
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.16);
      }
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  }

  // --- LocalStorage Layer ---
  function loadFromStorage() {
    try {
      const storedTasks = localStorage.getItem(STORAGE_KEY);
      if (storedTasks !== null) {
        state.tasks = JSON.parse(storedTasks);
      } else {
        // First visit: Seed with initial tasks
        state.tasks = [...INITIAL_TASKS];
        saveToStorage();
      }

      const storedSettings = localStorage.getItem(SETTINGS_KEY);
      if (storedSettings !== null) {
        const settings = JSON.parse(storedSettings);
        if (typeof settings.soundEnabled === 'boolean') {
          state.soundEnabled = settings.soundEnabled;
        }
      }
    } catch (e) {
      console.error('Failed to load from localStorage:', e);
      state.tasks = [...INITIAL_TASKS];
    }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ soundEnabled: state.soundEnabled })
      );
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  // --- DOM Elements ---
  const currentDateDisplay = document.getElementById('currentDateDisplay');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const soundOnIcon = soundToggleBtn.querySelector('.sound-on-icon');
  const soundOffIcon = soundToggleBtn.querySelector('.sound-off-icon');

  const completedCountEl = document.getElementById('completedCount');
  const totalCountEl = document.getElementById('totalCount');
  const progressHeadlineEl = document.getElementById('progressHeadline');
  const progressBarFillEl = document.getElementById('progressBarFill');
  const progressBarTrackEl = document.getElementById('progressBarTrack');

  const todoForm = document.getElementById('todoForm');
  const taskInput = document.getElementById('taskInput');
  const prioritySelect = document.getElementById('prioritySelect');
  const categorySelect = document.getElementById('categorySelect');
  const dueDateInput = document.getElementById('dueDateInput');

  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const filterPills = document.querySelectorAll('.filter-pill');
  const sortBySelect = document.getElementById('sortBySelect');

  const taskList = document.getElementById('taskList');
  const emptyState = document.getElementById('emptyState');
  const emptyMessage = document.getElementById('emptyMessage');
  const activeCountText = document.getElementById('activeCountText');
  const clearCompletedBtn = document.getElementById('clearCompletedBtn');

  // Edit Modal Elements
  const editModal = document.getElementById('editModal');
  const editForm = document.getElementById('editForm');
  const editTaskId = document.getElementById('editTaskId');
  const editTaskText = document.getElementById('editTaskText');
  const editPrioritySelect = document.getElementById('editPrioritySelect');
  const editCategorySelect = document.getElementById('editCategorySelect');
  const editDueDateInput = document.getElementById('editDueDateInput');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');

  const toastContainer = document.getElementById('toastContainer');

  // --- Date Display Initialization ---
  function updateHeaderDate() {
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    const today = new Date().toLocaleDateString(undefined, options);
    currentDateDisplay.textContent = today;
  }

  // --- Toast System ---
  function showToast(message, actionText = null, onAction = null, duration = 3500) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (actionText) toast.classList.add('toast-undo');

    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    toast.appendChild(messageSpan);

    if (actionText && onAction) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'toast-btn';
      actionBtn.textContent = actionText;
      actionBtn.onclick = () => {
        onAction();
        removeToast(toast);
      };
      toast.appendChild(actionBtn);
    }

    toastContainer.appendChild(toast);

    const timer = setTimeout(() => {
      removeToast(toast);
    }, duration);

    function removeToast(el) {
      clearTimeout(timer);
      el.classList.add('toast-hide');
      el.addEventListener('animationend', () => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    }
  }

  // --- Progress & Stats Update ---
  function updateProgress() {
    const total = state.tasks.length;
    const completed = state.tasks.filter(t => t.completed).length;
    const active = total - completed;

    completedCountEl.textContent = completed;
    totalCountEl.textContent = total;
    activeCountText.textContent = `${active} item${active === 1 ? '' : 's'} remaining`;

    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    progressBarFillEl.style.width = `${percentage}%`;
    progressBarTrackEl.setAttribute('aria-valuenow', percentage);

    // Dynamic encouraging headline
    if (total === 0) {
      progressHeadlineEl.textContent = 'Add a task to start organizing!';
    } else if (percentage === 0) {
      progressHeadlineEl.textContent = "Ready to start today's tasks?";
    } else if (percentage < 50) {
      progressHeadlineEl.textContent = "Great start, keep building momentum!";
    } else if (percentage < 100) {
      progressHeadlineEl.textContent = "Over halfway done! Almost there!";
    } else {
      progressHeadlineEl.textContent = "All tasks completed! Fantastic job! 🎉";
    }

    clearCompletedBtn.style.visibility = completed > 0 ? 'visible' : 'hidden';
  }

  // --- Filtering & Sorting ---
  function getFilteredAndSortedTasks() {
    let result = [...state.tasks];

    // Filter status
    if (state.filter === 'active') {
      result = result.filter(t => !t.completed);
    } else if (state.filter === 'completed') {
      result = result.filter(t => t.completed);
    } else if (state.filter === 'urgent') {
      result = result.filter(t => t.priority === 'urgent');
    }

    // Search query filter
    if (state.searchQuery.trim() !== '') {
      const q = state.searchQuery.toLowerCase().trim();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.category && t.category.toLowerCase().includes(q))
      );
    }

    // Sorting
    const priorityWeight = { urgent: 3, high: 2, normal: 1 };

    result.sort((a, b) => {
      switch (state.sortBy) {
        case 'createdAt-desc':
          return b.createdAt - a.createdAt;
        case 'createdAt-asc':
          return a.createdAt - b.createdAt;
        case 'dueDate-asc':
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        case 'priority-desc':
          return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        case 'alphabetical':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return result;
  }

  // --- Format Due Date Badge ---
  function formatDueDate(dateStr) {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [year, month, day] = dateStr.split('-').map(Number);
    const target = new Date(year, month - 1, day);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `Overdue (${Math.abs(diffDays)}d ago)`, isOverdue: true, isToday: false };
    } else if (diffDays === 0) {
      return { text: 'Due Today', isOverdue: false, isToday: true };
    } else if (diffDays === 1) {
      return { text: 'Due Tomorrow', isOverdue: false, isToday: false };
    } else {
      const formatted = target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return { text: `Due ${formatted}`, isOverdue: false, isToday: false };
    }
  }

  // --- Task DOM Element Creator ---
  function createTaskElement(task) {
    const li = document.createElement('li');
    li.className = `task-item ${task.priority}-border`;
    if (task.completed) li.classList.add('completed');
    li.dataset.id = task.id;

    // Checkbox container
    const checkboxWrapper = document.createElement('label');
    checkboxWrapper.className = 'checkbox-wrapper';
    checkboxWrapper.title = task.completed ? 'Mark as incomplete' : 'Mark as complete';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'custom-checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `Complete task: ${task.title}`);

    checkbox.addEventListener('change', () => {
      toggleTaskComplete(task.id);
    });

    const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    checkSvg.setAttribute('viewBox', '0 0 24 24');
    checkSvg.setAttribute('width', '14');
    checkSvg.setAttribute('height', '14');
    checkSvg.setAttribute('fill', 'none');
    checkSvg.setAttribute('stroke', 'currentColor');
    checkSvg.setAttribute('stroke-width', '3');
    checkSvg.setAttribute('stroke-linecap', 'round');
    checkSvg.setAttribute('stroke-linejoin', 'round');
    checkSvg.classList.add('check-icon');

    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', '20 6 9 17 4 12');
    checkSvg.appendChild(polyline);

    checkboxWrapper.appendChild(checkbox);
    checkboxWrapper.appendChild(checkSvg);

    // Task text and details
    const contentDiv = document.createElement('div');
    contentDiv.className = 'task-content';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'task-title';
    titleDiv.textContent = task.title;

    // Tags Row
    const tagsRow = document.createElement('div');
    tagsRow.className = 'task-tags-row';

    // Priority Badge
    const priorityBadge = document.createElement('span');
    priorityBadge.className = `badge badge-priority-${task.priority}`;
    priorityBadge.textContent = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
    tagsRow.appendChild(priorityBadge);

    // Category Badge
    if (task.category) {
      const categoryBadge = document.createElement('span');
      categoryBadge.className = 'badge badge-category';
      categoryBadge.textContent = task.category;
      tagsRow.appendChild(categoryBadge);
    }

    // Due Date Badge
    const dueDateInfo = formatDueDate(task.dueDate);
    if (dueDateInfo) {
      const dateBadge = document.createElement('span');
      dateBadge.className = 'badge badge-date';
      if (dueDateInfo.isOverdue && !task.completed) dateBadge.classList.add('overdue');
      if (dueDateInfo.isToday && !task.completed) dateBadge.classList.add('today');

      dateBadge.innerHTML = `
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>${dueDateInfo.text}</span>
      `;
      tagsRow.appendChild(dateBadge);
    }

    contentDiv.appendChild(titleDiv);
    contentDiv.appendChild(tagsRow);

    // Action buttons (Edit & Delete)
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'task-actions';

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'task-action-btn edit-btn';
    editBtn.title = 'Edit task';
    editBtn.setAttribute('aria-label', `Edit task: ${task.title}`);
    editBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    `;
    editBtn.onclick = () => openEditModal(task);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-action-btn delete-btn';
    deleteBtn.title = 'Delete task';
    deleteBtn.setAttribute('aria-label', `Delete task: ${task.title}`);
    deleteBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;
    deleteBtn.onclick = () => deleteTaskWithAnimation(li, task.id);

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);

    li.appendChild(checkboxWrapper);
    li.appendChild(contentDiv);
    li.appendChild(actionsDiv);

    return li;
  }

  // --- Render Cycle ---
  function render() {
    const visibleTasks = getFilteredAndSortedTasks();
    taskList.innerHTML = '';

    if (visibleTasks.length === 0) {
      emptyState.style.display = 'flex';
      if (state.searchQuery.trim() !== '') {
        emptyMessage.textContent = `No tasks matching "${state.searchQuery}". Try a different keyword.`;
      } else if (state.filter === 'completed') {
        emptyMessage.textContent = 'No completed tasks yet. Finish a task to see it here!';
      } else if (state.filter === 'active') {
        emptyMessage.textContent = 'No active tasks. Take a break or add a new goal!';
      } else if (state.filter === 'urgent') {
        emptyMessage.textContent = 'No urgent tasks! Everything is under control.';
      } else {
        emptyMessage.textContent = 'Add your first task above to kickstart your day.';
      }
    } else {
      emptyState.style.display = 'none';
      const fragment = document.createDocumentFragment();
      visibleTasks.forEach(task => {
        fragment.appendChild(createTaskElement(task));
      });
      taskList.appendChild(fragment);
    }

    updateProgress();
  }

  // --- Task State Mutations ---

  function addTask(title, priority, category, dueDate) {
    const newTask = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      title: title.trim(),
      priority: priority || 'normal',
      category: category || 'General',
      dueDate: dueDate || '',
      completed: false,
      createdAt: Date.now()
    };

    state.tasks.unshift(newTask);
    saveToStorage();
    playSound('add');
    render();
    showToast('Task added successfully!');
  }

  function toggleTaskComplete(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    task.completed = !task.completed;
    saveToStorage();

    if (task.completed) {
      playSound('complete');
    }

    render();
  }

  function deleteTaskWithAnimation(element, id) {
    const taskIndex = state.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    lastDeletedTask = { task: state.tasks[taskIndex], index: taskIndex };

    element.classList.add('removing');
    playSound('delete');

    element.addEventListener('animationend', () => {
      state.tasks = state.tasks.filter(t => t.id !== id);
      saveToStorage();
      render();

      showToast('Task deleted', 'Undo', () => {
        if (lastDeletedTask) {
          state.tasks.splice(lastDeletedTask.index, 0, lastDeletedTask.task);
          saveToStorage();
          render();
          playSound('add');
          lastDeletedTask = null;
        }
      });
    }, { once: true });
  }

  function clearCompletedTasks() {
    const completedTasks = state.tasks.filter(t => t.completed);
    if (completedTasks.length === 0) return;

    const count = completedTasks.length;
    state.tasks = state.tasks.filter(t => !t.completed);
    saveToStorage();
    playSound('delete');
    render();
    showToast(`Cleared ${count} completed task${count === 1 ? '' : 's'}.`);
  }

  // --- Modal Operations ---
  function openEditModal(task) {
    editTaskId.value = task.id;
    editTaskText.value = task.title;
    editPrioritySelect.value = task.priority;
    editCategorySelect.value = task.category || 'General';
    editDueDateInput.value = task.dueDate || '';

    editModal.style.display = 'flex';
    editModal.setAttribute('aria-hidden', 'false');
    editTaskText.focus();
  }

  function closeEditModal() {
    editModal.style.display = 'none';
    editModal.setAttribute('aria-hidden', 'true');
    editForm.reset();
  }

  function saveEditedTask(e) {
    e.preventDefault();
    const id = editTaskId.value;
    const task = state.tasks.find(t => t.id === id);

    if (task) {
      task.title = editTaskText.value.trim();
      task.priority = editPrioritySelect.value;
      task.category = editCategorySelect.value;
      task.dueDate = editDueDateInput.value;

      saveToStorage();
      render();
      closeEditModal();
      showToast('Task updated!');
    }
  }

  // --- Audio Toggle ---
  function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    updateSoundButton();
    saveToStorage();

    if (state.soundEnabled) {
      playSound('add');
      showToast('Audio feedback enabled 🔔');
    } else {
      showToast('Audio feedback muted 🔕');
    }
  }

  function updateSoundButton() {
    if (state.soundEnabled) {
      soundOnIcon.style.display = 'block';
      soundOffIcon.style.display = 'none';
      soundToggleBtn.title = 'Audio feedback: Enabled';
    } else {
      soundOnIcon.style.display = 'none';
      soundOffIcon.style.display = 'block';
      soundToggleBtn.title = 'Audio feedback: Muted';
    }
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    // Add task form submission
    todoForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = taskInput.value.trim();
      if (!text) return;

      const priority = prioritySelect.value;
      const category = categorySelect.value;
      const dueDate = dueDateInput.value;

      addTask(text, priority, category, dueDate);
      taskInput.value = '';
      taskInput.focus();
    });

    // Sound toggle
    soundToggleBtn.addEventListener('click', toggleSound);

    // Filter pills
    filterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        filterPills.forEach(p => {
          p.classList.remove('active');
          p.setAttribute('aria-selected', 'false');
        });
        pill.classList.add('active');
        pill.setAttribute('aria-selected', 'true');

        state.filter = pill.dataset.filter;
        render();
      });
    });

    // Search input
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
      render();
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      clearSearchBtn.style.display = 'none';
      searchInput.focus();
      render();
    });

    // Sort select
    sortBySelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      render();
    });

    // Clear completed button
    clearCompletedBtn.addEventListener('click', clearCompletedTasks);

    // Edit modal events
    editForm.addEventListener('submit', saveEditedTask);
    closeModalBtn.addEventListener('click', closeEditModal);
    cancelEditBtn.addEventListener('click', closeEditModal);

    // Close modal when clicking outside dialog
    editModal.addEventListener('click', (e) => {
      if (e.target === editModal) {
        closeEditModal();
      }
    });

    // Global keyboard shortcuts (Escape to close modal)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && editModal.style.display === 'flex') {
        closeEditModal();
      }
    });
  }

  // --- Initialization ---
  function init() {
    loadFromStorage();
    updateHeaderDate();
    updateSoundButton();
    setupEventListeners();
    render();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
