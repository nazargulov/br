# Настройка Stripe для бразильского рынка

## 1. Первоначальная настройка Stripe

### Шаг 1: Создание аккаунта
1. Зайди на https://dashboard.stripe.com/register
2. Выбери страну: **Brazil** (или свою страну, если у тебя нет бразильского юрлица)
3. Заполни данные компании

### Шаг 2: Активация режима Live
1. Dashboard → Settings → Business settings
2. Заполни все требуемые данные
3. Подключи банковский счёт для выплат

---

## 2. Настройка Payment Methods

### Включение PIX:
1. Dashboard → Settings → Payment methods
2. Найди **PIX** в списке
3. Нажми **Turn on**
4. PIX будет автоматически показываться бразильским клиентам

### Включение Boleto:
1. В том же разделе найди **Boleto**
2. Нажми **Turn on**
3. Boleto срок оплаты: 3 дня (рекомендуется)

### Карты:
- Visa, Mastercard, American Express — включены по умолчанию

---

## 3. Создание Products (Продуктов)

### Шаг 1: Перейди в Products
Dashboard → Products → Add product

### Продукт 1: EmailMassa Premium Mensal
```
Name: EmailMassa Premium Mensal
Description: Acesso premium ao EmailMassa - 500 emails/dia, templates, agendamento
Pricing:
  - Price: R$ 9,90
  - Billing period: Monthly
  - Currency: BRL
Tax behavior: Inclusive
```

### Продукт 2: EmailMassa Premium Anual
```
Name: EmailMassa Premium Anual
Description: Acesso premium ao EmailMassa por 1 ano - economia de 2 meses
Pricing:
  - Price: R$ 99,90
  - Billing period: Yearly
  - Currency: BRL
Tax behavior: Inclusive
```

### Продукт 3: EmailMassa Vitalício
```
Name: EmailMassa Vitalício
Description: Acesso vitalício ao EmailMassa Premium - pagamento único
Pricing:
  - Price: R$ 99,90
  - One time
  - Currency: BRL
Tax behavior: Inclusive
```

---

## 4. Создание Payment Links

### Способ 1: Payment Links (самый простой)

Dashboard → Payment links → Create payment link

1. Выбери продукт (например, Premium Mensal)
2. After payment → Redirect: `https://[username].github.io/br/envio-email-em-massa/sucesso.html`
3. Скопируй ссылку и вставь на сайт

### Способ 2: Checkout Sessions (для кастомизации)

Потребуется backend. Пример на Node.js:

```javascript
const stripe = require('stripe')('sk_live_...');

app.post('/create-checkout-session', async (req, res) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card', 'pix', 'boleto'],
    line_items: [{
      price: 'price_xxx', // ID цены из Stripe
      quantity: 1,
    }],
    mode: 'subscription', // или 'payment' для one-time
    success_url: 'https://site.com/sucesso?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://site.com/cancelado',
    locale: 'pt-BR',
    currency: 'brl',
  });

  res.redirect(303, session.url);
});
```

---

## 5. Webhook для активации Premium

### Шаг 1: Создай Webhook
Dashboard → Developers → Webhooks → Add endpoint

```
Endpoint URL: https://your-backend.com/webhook/stripe
Events to send:
  - checkout.session.completed
  - customer.subscription.created
  - customer.subscription.updated
  - customer.subscription.deleted
  - invoice.paid
  - invoice.payment_failed
```

### Шаг 2: Обработка Webhook

```javascript
const endpointSecret = 'whsec_...';

app.post('/webhook/stripe', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      // Активировать Premium для session.customer_email
      activatePremium(session.customer_email, session.metadata.extension_user_id);
      break;

    case 'customer.subscription.deleted':
      // Деактивировать Premium
      deactivatePremium(event.data.object.customer);
      break;
  }

  res.json({received: true});
});
```

---

## 6. Customer Portal (управление подпиской)

### Настройка:
Dashboard → Settings → Billing → Customer portal

Включи:
- ✅ Update payment methods
- ✅ Cancel subscriptions
- ✅ View invoices

### Ссылка на портал:
```javascript
const portalSession = await stripe.billingPortal.sessions.create({
  customer: 'cus_xxx',
  return_url: 'https://site.com/conta',
});

// Redirect to portalSession.url
```

---

## 7. Тестирование

### Test Mode:
1. Dashboard → переключи на **Test mode** (toggle вверху)
2. Используй тестовые ключи `sk_test_...` и `pk_test_...`

### Тестовые карты:
```
Успешная оплата: 4242 4242 4242 4242
Отклонённая:     4000 0000 0000 0002
Требует 3DS:     4000 0025 0000 3155
```

### Тестовый PIX:
В test mode PIX симулируется автоматически

### Тестовый Boleto:
В test mode Boleto можно "оплатить" через Dashboard

---

## 8. Интеграция с Chrome Extension

### Проверка статуса Premium:

```javascript
// В popup.js или background.js
async function checkPremiumStatus(userEmail) {
  try {
    const response = await fetch('https://your-backend.com/api/check-premium', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail })
    });

    const data = await response.json();
    return data.isPremium;
  } catch (error) {
    console.error('Error checking premium:', error);
    return false;
  }
}
```

### Хранение статуса локально:

```javascript
// После успешной проверки
chrome.storage.sync.set({
  isPremium: true,
  premiumUntil: '2026-02-09',
  userEmail: 'user@example.com'
});

// Проверка
chrome.storage.sync.get(['isPremium'], (result) => {
  if (result.isPremium) {
    // Показать premium функции
  }
});
```

---

## 9. Цены и комиссии Stripe в Бразилии

| Метод | Комиссия Stripe | Время получения |
|-------|-----------------|-----------------|
| Карты | 3.99% + R$0.39 | 2-3 дня |
| PIX | 1.40% | Мгновенно |
| Boleto | R$3.49 за транзакцию | 1-3 дня |

**Рекомендация:** Продвигай PIX — самая низкая комиссия!

---

## 10. Чеклист перед запуском

### Stripe Dashboard:
- [ ] Аккаунт верифицирован
- [ ] Банковский счёт подключен
- [ ] PIX включен
- [ ] Boleto включен (опционально)
- [ ] Products созданы (3 плана)
- [ ] Payment Links созданы
- [ ] Webhook настроен
- [ ] Customer Portal настроен
- [ ] Переключен в Live mode

### На сайте:
- [ ] Кнопки ведут на Payment Links
- [ ] Страница sucesso.html готова
- [ ] Страница cancelado.html готова
- [ ] Политика возврата (7 дней по закону)

### В расширении:
- [ ] Проверка premium статуса работает
- [ ] Free/Premium функции разделены
- [ ] Ссылка на upgrade работает

---

## 11. Полезные ссылки

- [Stripe Dashboard](https://dashboard.stripe.com/)
- [Stripe Docs - PIX](https://stripe.com/docs/payments/pix)
- [Stripe Docs - Boleto](https://stripe.com/docs/payments/boleto)
- [Stripe Docs - Checkout](https://stripe.com/docs/payments/checkout)
- [Stripe Docs - Webhooks](https://stripe.com/docs/webhooks)
- [Stripe Docs - Customer Portal](https://stripe.com/docs/billing/subscriptions/integrating-customer-portal)

---

*Инструкция по настройке Stripe для EmailMassa — бразильский рынок*
