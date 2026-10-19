/* ESS Admin display-only folds. Never reads, writes, deletes, or modifies logged data. */
(() => {
  'use strict';

  function attachFold(topId, bottomId, contentId, sectionName, shortName) {
    const content = document.getElementById(contentId);
    const buttons = [topId, bottomId]
      .map(id => document.getElementById(id))
      .filter(Boolean);
    if (!content || !buttons.length) return;

    function show(expanded) {
      content.hidden = !expanded;
      for (const button of buttons) {
        button.setAttribute('aria-expanded', String(expanded));
        button.setAttribute('aria-label', (expanded ? 'Hide ' : 'Show ') + sectionName);
        const caption = button.querySelector('.fold-action');
        if (caption) caption.textContent = (expanded ? 'Hide ' : 'Show ') + shortName;
      }
    }

    show(!content.hidden); // HTML starts closed, even before JS executes.
    for (const button of buttons) {
      button.addEventListener('click', () => show(content.hidden));
    }
  }

  attachFold('hours-fold-toggle', 'hours-fold-bottom', 'staff-log-content', 'Staff Hours Log', 'hours');
  attachFold('notes-fold-toggle', 'notes-fold-bottom', 'notes-content', 'My Notes', 'notes');
})();
