// Quick Check multi-step form
(function () {
  const form = document.querySelector('.qc-form');
  if (!form) return;

  const steps = Array.from(form.querySelectorAll('.qc-step'));
  const progressBar = form.querySelector('.qc-progress-bar');
  const currentLabel = form.querySelector('.qc-current');
  const totalLabel = form.querySelector('.qc-total');
  const total = steps.length;
  totalLabel.textContent = total;

  let currentIndex = 0;

  function showStep(index) {
    steps.forEach((s, i) => s.classList.toggle('is-active', i === index));
    currentIndex = index;
    const pct = ((index + 1) / total) * 100;
    progressBar.style.width = pct + '%';
    currentLabel.textContent = index + 1;
    // Focus first interactive element for accessibility
    const active = steps[index];
    const focusable = active.querySelector('input, button');
    if (focusable) {
      setTimeout(() => focusable.focus({ preventScroll: true }), 100);
    }
    // Scroll step into view smoothly on small screens
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Enable/disable Continue button based on radio selection
  steps.forEach((step) => {
    const radios = step.querySelectorAll('input[type="radio"]');
    const nextBtn = step.querySelector('.qc-next');
    if (radios.length && nextBtn) {
      radios.forEach((radio) => {
        radio.addEventListener('change', () => {
          nextBtn.disabled = false;
        });
      });
    }
  });

  // Next button handlers
  form.querySelectorAll('.qc-next').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (currentIndex < total - 1) showStep(currentIndex + 1);
    });
  });

  // Back button handlers
  form.querySelectorAll('.qc-back').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (currentIndex > 0) showStep(currentIndex - 1);
    });
  });

  // On submit: let the form post normally; final validation handled by browser
  form.addEventListener('submit', (e) => {
    const lastStep = steps[steps.length - 1];
    const required = lastStep.querySelectorAll('input[required]');
    let valid = true;
    required.forEach((input) => {
      if (!input.value.trim()) {
        valid = false;
        input.style.borderColor = '#c48a82';
      }
    });
    if (!valid) {
      e.preventDefault();
    }
  });

  // Initialize
  showStep(0);
})();

// Smooth scroll offset for sticky header
document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href');
    if (id.length <= 1) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    const headerHeight = document.querySelector('.site-header')?.offsetHeight || 0;
    const top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 10;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});
