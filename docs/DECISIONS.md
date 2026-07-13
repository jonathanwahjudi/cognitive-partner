# Open Questions → Decisions

## 1. Primary Input Modality

**Decision: Text-based with voice roadmap**

- **Phase 1 (MVP):** Text-based chat interface via web
- **Phase 2:** Voice input/output
- **Why text first:** Lower technical complexity, clearer signal capture

---

## 2. How the Partner Learns Over Time

**Decision: Hybrid approach — passive observation + explicit feedback + structured onboarding**

1. **Passive Observation**
   - Message frequency & timing
   - Chat patterns and energy inference
   - Signal extraction from natural language

2. **Explicit Feedback**
   - Thumbs up/down on responses
   - Energy/stress level self-report
   - Mode preference buttons

3. **Structured Onboarding**
   - Initial intake quiz
   - Micro-surveys throughout week
   - Pattern calibration

---

## 3. Mode Transitions

**Decision: Hybrid — automatic detection + manual override**

| Signal | Threshold | Mode |
|--------|-----------|------|
| Energy < 40% | Immediate | Protector |
| Emotional keywords | Immediate | Anchor |
| Planning keywords | Immediate | Navigator |

---

## 4. Monetization Model

**Decision: Freemium B2C + Enterprise B2B2C**

- **Free Tier:** $0/month (5 sessions/month)
- **Pro Tier:** $9.99/month or $99/year
- **Enterprise:** $5-8/employee/month

---

## 5. Data & Privacy

**Decision: Privacy-first, no training on user data**

- User data never leaves their environment or is encrypted end-to-end
- LLM calls only send current message + system context
- No training on user data
- GDPR, CCPA, HIPAA-ready
