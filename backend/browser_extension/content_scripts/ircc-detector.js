/**
 * ircc-detector.js
 * Detects which IRCC page we're on and triggers appropriate filler
 */

const IRCC_PAGES = {
  PERSONAL_INFO: {
    patterns: [/personal-information/i, /renseignements-personnels/i],
    title: "Personal Information"
  },
  LANGUAGE_TEST: {
    patterns: [/language-test/i, /test-linguistique/i, /language-proficiency/i],
    title: "Language Test Results"
  },
  EDUCATION: {
    patterns: [/education/i, /scolarite/i],
    title: "Education History"
  },
  WORK_HISTORY: {
    patterns: [/work-history/i, /employment/i, /historique-emploi/i],
    title: "Work History"
  },
  CONTACT_INFO: {
    patterns: [/contact-information/i, /coordonnees/i],
    title: "Contact Information"
  },
  ADAPTABILITY: {
    patterns: [/adaptability/i, /adaptabilite/i],
    title: "Adaptability Factors"
  },
  EXPRESS_ENTRY_PROFILE: {
    patterns: [/express-entry/i, /entree-express/i],
    title: "Express Entry Profile"
  }
};

function detectCurrentPage() {
  const url = window.location.href.toLowerCase();
  const pageTitle = document.title.toLowerCase();

  for (const [pageKey, page] of Object.entries(IRCC_PAGES)) {
    for (const pattern of page.patterns) {
      if (pattern.test(url) || pattern.test(pageTitle)) {
        return { key: pageKey, ...page };
      }
    }
  }
  return null;
}

function injectOverlay(pageInfo) {
  const existing = document.getElementById('ee-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ee-overlay';
  overlay.innerHTML = `
    <div class="ee-header">
      <span class="ee-logo">🍁</span>
      <span class="ee-title">Express Entry PR</span>
      <button id="ee-close" class="ee-close">✕</button>
    </div>
    <div class="ee-body">
      <p class="ee-page-detected">📄 Detected: <strong>${pageInfo.title}</strong></p>
      <button id="ee-fill-btn" class="ee-btn ee-btn-primary">
        ✨ Auto-Fill This Page
      </button>
      <button id="ee-clear-btn" class="ee-btn ee-btn-secondary">
        🗑 Clear Filled Fields
      </button>
      <div id="ee-status" class="ee-status"></div>
      <p class="ee-disclaimer">
        ⚠️ Always review before submitting. You are in full control.
      </p>
    </div>
  `;

  document.body.appendChild(overlay);
  makeDraggable(overlay);

  document.getElementById('ee-close').addEventListener('click', () => overlay.remove());
  document.getElementById('ee-fill-btn').addEventListener('click', () => fillPage(pageInfo.key));
  document.getElementById('ee-clear-btn').addEventListener('click', clearFilledFields);
}

function makeDraggable(element) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const header = element.querySelector('.ee-header');

  header.addEventListener('mousedown', (e) => {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = () => {
      document.onmouseup = null;
      document.onmousemove = null;
    };
    document.onmousemove = (e) => {
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      element.style.top = (element.offsetTop - pos2) + "px";
      element.style.left = (element.offsetLeft - pos1) + "px";
    };
  });
}

// Initialize
const pageInfo = detectCurrentPage();
if (pageInfo) {
  injectOverlay(pageInfo);
}
