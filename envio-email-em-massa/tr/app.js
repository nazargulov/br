const CWS_URL = 'https://chromewebstore.google.com/detail/fpffoemdjikjbdibennhoeblaefafohg';

document.querySelectorAll('[data-cws-link]').forEach((link) => {
  link.href = CWS_URL;
});

const emailParam = new URLSearchParams(window.location.search).get('email');
document.querySelectorAll('[data-account-email]').forEach((element) => {
  if (emailParam) element.textContent = emailParam;
});
