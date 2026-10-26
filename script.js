/* ==========================================================================
   Next Level Gaming & Esports Arena - script.js
   This one file is loaded by every page. Each "setup" function below checks
   whether its page is open and does nothing if it is not.

   What it does:
   1. FEES page      - calculates the quote (discount + 15% VAT), validates the
                       "Request Consultation" form, remembers selections.
   2. PACKAGE pages  - "Add to Quote" sends the experience to the fees page,
                       where it is ticked automatically (and kept when you
                       add more experiences from other pages).
   3. OVERVIEW page  - sorts the experiences and the fee table.
   4. CONTACT page   - validates the message form.
   5. ALL pages      - resets the mobile menu drop-down.
   ========================================================================== */
'use strict';

/* ==========================================================================
   PART A - THE CALCULATION (no page code in here, so it is easy to test)
   Money is worked out in CENTS (whole numbers) so there are no strange
   decimal errors like 2458.1249999.
   ========================================================================== */
var VAT_PERCENT = 15;

// How many experiences are booked -> discount percentage
//   1 = 0%,  2 = 5%,  3 = 10%,  more than 3 = 15%
function getDiscountPercent(count) {
  if (count > 3) { return 15; }
  if (count === 3) { return 10; }
  if (count === 2) { return 5; }
  return 0;
}

// prices = list of prices in rand, e.g. [1500, 750]
function calculateQuote(prices) {
  var subtotalCents = 0;
  prices.forEach(function (price) { subtotalCents += Math.round(price * 100); });

  var discountPercent = getDiscountPercent(prices.length);
  var discountCents = Math.round(subtotalCents * discountPercent / 100);
  var afterDiscountCents = subtotalCents - discountCents;
  var vatCents = Math.round(afterDiscountCents * VAT_PERCENT / 100); // VAT is charged AFTER the discount
  var totalCents = afterDiscountCents + vatCents;

  return {
    count: prices.length,
    discountPercent: discountPercent,
    subtotalCents: subtotalCents,
    discountCents: discountCents,
    vatCents: vatCents,
    totalCents: totalCents
  };
}

// 245813 -> "R2458.13"
function formatMoney(cents) {
  return 'R' + (cents / 100).toFixed(2);
}

/* ==========================================================================
   PART B - SMALL HELPERS SHARED BY THE FORMS
   ========================================================================== */
// Each check returns an error message, or '' when the value is fine
function checkFullName(value) {
  value = value.trim();
  if (value === '') { return 'Please enter your full name.'; }
  if (!/^[\p{L}][\p{L}' .-]{1,59}$/u.test(value)) {
    return 'Please use letters only (at least 2 characters).';
  }
  return '';
}

function checkPhone(value) {
  value = value.trim();
  if (value === '') { return 'Please enter your phone number.'; }
  // Remove spaces, dashes and brackets, then expect 0821234567 or +27821234567
  var digits = value.replace(/[\s\-()]/g, '');
  if (!/^(\+27|0)\d{9}$/.test(digits)) {
    return 'Please enter a valid South African number, e.g. 082 123 4567.';
  }
  return '';
}

function checkEmail(value) {
  value = value.trim();
  if (value === '') { return 'Please enter your email address.'; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return 'Please enter a valid email address, like name@example.com.';
  }
  return '';
}

function checkMessage(value) {
  value = value.trim();
  if (value === '') { return 'Please type your message.'; }
  if (value.length < 10) { return 'Please write at least 10 characters so we can help you.'; }
  return '';
}

// Finds the error paragraph for an input (or creates one if the page has none)
function getErrorElement(input) {
  var id = input.id + '-error';
  var el = document.getElementById(id);
  if (!el) {
    el = document.createElement('p');
    el.className = 'field-error';
    el.id = id;
    el.hidden = true;
    input.after(el);
  }
  input.setAttribute('aria-describedby', id);
  return el;
}

// Shows a message under a field ('' clears it)
function setFieldError(input, message) {
  var el = getErrorElement(input);
  el.textContent = message;
  el.hidden = (message === '');
  input.classList.toggle('invalid', message !== '');
  input.setAttribute('aria-invalid', message !== '' ? 'true' : 'false');
}

// Makes a field check itself when you leave it, and again while you fix it
function addLiveValidation(input, checkFunction) {
  input.addEventListener('blur', function () { setFieldError(input, checkFunction(input.value)); });
  input.addEventListener('input', function () {
    if (input.classList.contains('invalid')) { setFieldError(input, checkFunction(input.value)); }
  });
}

// Creates the green / red message box shown above a form
function createStatusBox(form) {
  var box = document.createElement('div');
  box.className = 'form-status';
  box.setAttribute('role', 'status');
  box.tabIndex = -1; // lets us move keyboard focus to it
  box.hidden = true;
  form.before(box);
  return box;
}

function showStatus(box, kind, text) {
  box.textContent = text;
  box.className = 'form-status ' + kind; // "success" or "error"
  box.hidden = false;
  box.focus();
}

/* ==========================================================================
   PART C - REMEMBERING THE QUOTE BETWEEN PAGES
   Uses sessionStorage (cleared when the tab closes). Wrapped in try/catch
   because some browsers block storage.
   ========================================================================== */
var QUOTE_STORAGE_KEY = 'nextlevelQuoteSelections';

function loadSelections() {
  try {
    var saved = sessionStorage.getItem(QUOTE_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    return [];
  }
}

function saveSelections(names) {
  try { sessionStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify(names)); } catch (error) { /* ignore */ }
}

/* ==========================================================================
   PART D - FEES PAGE
   ========================================================================== */
function setupFeesPage() {
  var form = document.getElementById('fees-form');
  if (!form) { return; }

  var checkboxes = Array.from(form.querySelectorAll('input[name="experiences"]'));
  var calculateButton = document.getElementById('calculate-btn');
  var summaryBox = document.getElementById('quote-summary');

  /* --- Extra elements the page does not have in its HTML --- */
  summaryBox.setAttribute('aria-live', 'polite');

  var itemsList = document.createElement('ul');          // list of chosen experiences
  itemsList.id = 'summary-items';
  summaryBox.querySelector('h2').after(itemsList);

  var discountNote = document.createElement('p');        // "2 experiences: 5% discount"
  discountNote.id = 'discount-note';
  discountNote.className = 'form-note';
  summaryBox.querySelector('.form-note').before(discountNote);

  var experiencesError = document.createElement('p');    // "Please select at least one..."
  experiencesError.id = 'experiences-error';
  experiencesError.className = 'field-error';
  experiencesError.hidden = true;
  form.querySelectorAll('fieldset')[1].after(experiencesError);

  var clearButton = document.createElement('button');    // "Clear Selections"
  clearButton.type = 'button';
  clearButton.id = 'clear-btn';
  clearButton.className = 'btn btn-secondary';
  clearButton.textContent = 'Clear Selections';
  form.querySelector('button[type="submit"]').after(clearButton);

  var notice = document.createElement('p');              // "X was added to your quote"
  notice.className = 'quote-notice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  form.before(notice);

  var status = createStatusBox(form);

  /* --- Step 1: tick boxes for experiences added on other pages --- */
  var selectedNames = loadSelections();
  var addedNow = [];
  new URLSearchParams(window.location.search).getAll('experience').forEach(function (name) {
    var exists = checkboxes.some(function (box) { return box.dataset.name === name; });
    if (exists && selectedNames.indexOf(name) === -1) {
      selectedNames.push(name);
      addedNow.push(name);
    }
  });
  saveSelections(selectedNames);
  checkboxes.forEach(function (box) { box.checked = selectedNames.indexOf(box.dataset.name) !== -1; });

  if (addedNow.length > 0) {
    notice.textContent = addedNow.join(', ') + ' added to your quote. Tick more experiences below if you like.';
    notice.hidden = false;
    // Remove "?experience=..." from the address bar so a refresh does not repeat it
    try { window.history.replaceState(null, '', window.location.pathname); } catch (error) { /* ignore */ }
  }

  /* --- Step 2: work out the quote and show it --- */
  function getSelected() {
    return checkboxes.filter(function (box) { return box.checked; }).map(function (box) {
      return { name: box.dataset.name, price: Number(box.value) };
    });
  }

  function updateQuote() {
    var selected = getSelected();
    var quote = calculateQuote(selected.map(function (item) { return item.price; }));

    document.getElementById('summary-subtotal').textContent = formatMoney(quote.subtotalCents);
    document.getElementById('summary-discount').textContent = '-' + formatMoney(quote.discountCents);
    document.getElementById('summary-vat').textContent = formatMoney(quote.vatCents);
    document.getElementById('summary-total').textContent = formatMoney(quote.totalCents);

    // List of chosen experiences
    itemsList.innerHTML = '';
    if (selected.length === 0) {
      var empty = document.createElement('li');
      empty.textContent = 'No experiences selected yet.';
      itemsList.appendChild(empty);
    }
    selected.forEach(function (item) {
      var li = document.createElement('li');
      li.textContent = item.name + ' - R' + item.price;
      itemsList.appendChild(li);
    });

    // Sentence about the discount
    if (quote.count === 0) {
      discountNote.textContent = 'Select experiences to see your quote. Book 2 or more for a discount.';
    } else if (quote.discountPercent === 0) {
      discountNote.textContent = '1 experience selected. Book 2 or more to get a discount.';
    } else {
      discountNote.textContent = quote.count + ' experiences selected: ' + quote.discountPercent + '% discount applied. ' +
        'VAT (' + VAT_PERCENT + '%) is added after the discount.';
    }

    if (quote.count > 0) { experiencesError.hidden = true; }
    return quote;
  }

  // Updates whenever a box is ticked or unticked, and remembers the choice
  checkboxes.forEach(function (box) {
    box.addEventListener('change', function () {
      saveSelections(getSelected().map(function (item) { return item.name; }));
      notice.hidden = true;
      updateQuote();
    });
  });

  // "Calculate Total Fee" button
  calculateButton.addEventListener('click', function () {
    var quote = updateQuote();
    if (quote.count === 0) {
      experiencesError.textContent = 'Please select at least one experience to calculate a fee.';
      experiencesError.hidden = false;
    }
  });

  // "Clear Selections" button
  clearButton.addEventListener('click', function () {
    checkboxes.forEach(function (box) { box.checked = false; });
    saveSelections([]);
    notice.hidden = true;
    experiencesError.hidden = true;
    updateQuote();
  });

  /* --- Step 3: validation for the details fields --- */
  var nameInput = document.getElementById('fullname');
  var phoneInput = document.getElementById('phone');
  var emailInput = document.getElementById('email');
  addLiveValidation(nameInput, checkFullName);
  addLiveValidation(phoneInput, checkPhone);
  addLiveValidation(emailInput, checkEmail);

  /* --- Step 4: "Request Consultation" button --- */
  form.addEventListener('submit', function (event) {
    event.preventDefault(); // stop the page reloading

    var problems = [
      { input: nameInput, message: checkFullName(nameInput.value) },
      { input: phoneInput, message: checkPhone(phoneInput.value) },
      { input: emailInput, message: checkEmail(emailInput.value) }
    ];
    problems.forEach(function (p) { setFieldError(p.input, p.message); });

    var quote = updateQuote();
    var problemCount = problems.filter(function (p) { return p.message !== ''; }).length;
    var firstBad = problems.filter(function (p) { return p.message !== ''; })[0];

    if (quote.count === 0) {
      experiencesError.textContent = 'Please select at least one experience before requesting a consultation.';
      experiencesError.hidden = false;
      problemCount++;
    }

    if (problemCount > 0) {
      showStatus(status, 'error', 'Please fix ' + problemCount + (problemCount === 1 ? ' problem' : ' problems') + ' below and try again.');
      (firstBad ? firstBad.input : checkboxes[0]).focus();
      return;
    }

    // Everything is valid.
    // NOTE: there is no server yet, so nothing is sent anywhere. Later you can
    // send the data to a service such as Formspree or EmailJS at this point.
    var firstName = nameInput.value.trim().split(' ')[0];
    var message = 'Thank you, ' + firstName + '! Your consultation request for ' + quote.count +
      (quote.count === 1 ? ' experience' : ' experiences') + ' has been received. ' +
      'Your quoted total is ' + formatMoney(quote.totalCents) + ' (incl. VAT). We will contact you on ' +
      phoneInput.value.trim() + '.';

    form.reset();
    saveSelections([]);
    [nameInput, phoneInput, emailInput].forEach(function (input) { setFieldError(input, ''); });
    notice.hidden = true;
    updateQuote();
    showStatus(status, 'success', message);
  });

  updateQuote();
}

/* ==========================================================================
   PART E - OVERVIEW PAGE: SORT DROP-DOWN
   ========================================================================== */
// "R1500" -> 1500
function readPrice(text) {
  return parseInt(text.replace(/\D/g, ''), 10);
}

// Re-orders the children of `parent` using the chosen sort mode
function sortChildren(parent, mode, getInfo) {
  var items = Array.from(parent.children).map(function (element) {
    return { element: element, info: getInfo(element) };
  });

  items.sort(function (a, b) {
    var byName = a.info.name.localeCompare(b.info.name);
    if (mode === 'price-asc') { return (a.info.price - b.info.price) || byName; }
    if (mode === 'price-desc') { return (b.info.price - a.info.price) || byName; }
    return byName; // "name" = A to Z
  });

  items.forEach(function (item) { parent.appendChild(item.element); });
}

function setupOverviewSort() {
  var select = document.getElementById('sort-experiences');
  if (!select) { return; }

  function applySort() {
    var mode = select.value;

    // The two lists (Gaming Packages and Individual Experiences)
    document.querySelectorAll('.experience-list').forEach(function (list) {
      sortChildren(list, mode, function (li) {
        return {
          name: li.querySelector('h3').textContent.trim(),
          price: readPrice(li.querySelector('.price').textContent)
        };
      });
    });

    // The Fee Summary table
    var tableBody = document.querySelector('.fee-table tbody');
    if (tableBody) {
      sortChildren(tableBody, mode, function (row) {
        return {
          name: row.cells[0].textContent.trim(),
          price: readPrice(row.cells[2].textContent)
        };
      });
    }
  }

  select.addEventListener('change', applySort);
  applySort(); // so the page matches what the drop-down says
}

/* ==========================================================================
   PART F - CONTACT PAGE FORM
   ========================================================================== */
function setupContactForm() {
  var form = document.querySelector('.contact-form');
  if (!form) { return; }

  form.noValidate = true; // show our messages instead of the browser pop-ups
  var status = createStatusBox(form);

  var nameInput = document.getElementById('c-fullname');
  var emailInput = document.getElementById('c-email');
  var messageInput = document.getElementById('c-message');
  addLiveValidation(nameInput, checkFullName);
  addLiveValidation(emailInput, checkEmail);
  addLiveValidation(messageInput, checkMessage);

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var problems = [
      { input: nameInput, message: checkFullName(nameInput.value) },
      { input: emailInput, message: checkEmail(emailInput.value) },
      { input: messageInput, message: checkMessage(messageInput.value) }
    ];
    problems.forEach(function (p) { setFieldError(p.input, p.message); });

    var bad = problems.filter(function (p) { return p.message !== ''; });
    if (bad.length > 0) {
      showStatus(status, 'error', 'Please fix ' + bad.length + (bad.length === 1 ? ' problem' : ' problems') + ' below and try again.');
      bad[0].input.focus();
      return;
    }

    // NOTE: no server yet, so the message is not actually sent (see the fees page note).
    var firstName = nameInput.value.trim().split(' ')[0];
    var email = emailInput.value.trim();
    form.reset();
    [nameInput, emailInput, messageInput].forEach(function (input) { setFieldError(input, ''); });
    showStatus(status, 'success', 'Thank you, ' + firstName + '! Your message has been received. We will reply to ' + email + '.');
  });
}

/* ==========================================================================
   PART G - MOBILE MENU DROP-DOWN
   The drop-down already changes page by itself (see the HTML). This only puts
   it back to "Menu" when you press the browser's Back button.
   ========================================================================== */
function setupMobileNav() {
  var mobileNav = document.getElementById('mobile-nav');
  if (!mobileNav) { return; }
  window.addEventListener('pageshow', function () { mobileNav.value = ''; });
}

/* ==========================================================================
   START: run everything once the page has loaded
   ========================================================================== */
document.addEventListener('DOMContentLoaded', function () {
  setupMobileNav();
  setupFeesPage();
  setupOverviewSort();
  setupContactForm();
});
