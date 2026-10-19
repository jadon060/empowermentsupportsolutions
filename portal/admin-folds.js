/* Presentation-only collapsible Admin sections. No reads/writes to staff or note data. */
(() => {
  'use strict';

  function attachFold(buttonId, contentId, sectionName) {
    const button = document.getElementById(buttonId);
    const content = document.getElementById(contentId);
    if (!button || !content) return;

    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      content.hidden = !expanded;
      button.setAttribute('aria-expanded', String(expanded));
      button.setAttribute('aria-label', (expanded ? 'Collapse ' : 'Expand ') + sectionName);
      button.querySelector('.fold-action').textContent = expanded ? 'Collapse' : 'Expand';
    });
  }

  attachFold('hours-fold-toggle', 'staff-log-content', 'Staff Hours Log');
  attachFold('notes-fold-toggle', 'notes-content', 'My Notes');
})();
