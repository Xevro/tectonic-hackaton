# Situation 141: demo video script

**Length:** 2:50 (hard limit 3:00)
**Voiceover:** about 390 words, one voice, calm and unhurried. ElevenLabs.
**Numbers:** all taken from `out/eval_report.json`. Do not change them.

---

## The story in one line

Every one of Kate's situations was thought of by a person. We built the thing that notices what nobody thought of, and knows what it must never show.

---

## Scene 1. The notification (0:00 to 0:20)

**VISUAL**
Black screen. A phone slides in. A KBC Mobile notification appears:
*"Your address has changed. Don't forget your home insurance."*
Hold two seconds. A date stamp fades in under it: *3 weeks after the move.*

**VOICEOVER**
> A KBC executive moved house last year. A few weeks later, his bank sent him this.
> It was correct. It was helpful. And it arrived after every decision had already been made.

---

## Scene 2. The real problem (0:20 to 0:40)

**VISUAL**
The notification shrinks into one tile. It multiplies into a grid of 140 tiles, filling the screen. Each tile shows a tiny human icon: someone wrote this one.

**VOICEOVER**
> Kate is one of the best banking assistants in the world. She reacts in more than 140 situations.
> Every single one of them was written by a person who noticed a pattern.
> So the limit on how well KBC understands its customers is not data. It is how fast people can think of the next situation.

---

## Scene 3. Sofie's household (0:40 to 1:10)

**VISUAL**
A simple timeline across the screen, left to right. Months label along the bottom.
- **March:** two small payment icons light up: *Accountant*, *Social insurance fund*. Above them, the salary line keeps arriving every month, steady.
- **June:** the salary line stops. At the same moment, a shield icon labelled *Hospitalisation cover* goes grey.
- Far right, **2028:** a single envelope marked *Social contributions regularisation*.

**VOICEOVER**
> This is Sofie's household. In March, her husband starts paying an accountant and a social insurance fund. His salary is still arriving. Nothing looks wrong.
> In June the salary stops. He's self-employed now. The family's hospitalisation cover ends the same day, and nobody tells them.
> And in about two years, a social contributions bill will arrive that they have no idea is coming.
> KBC could see all of it, starting in March. There was simply no rule for it, because nobody had written one.

---

## Scene 4. The engine (1:10 to 1:40)

**VISUAL**
Screen recording of the pipeline. Thousands of dots, one per household, drifting slowly. Most move in small loops. Some suddenly break away from their own path; those dots light up. Then the lit dots gather into a few distinct clusters.

**VOICEOVER**
> So we built something different. We don't tell it what a life event is. We give it no labels at all.
> Every household is compared only to its own past. When a household's pattern bends away from its own normal, the engine notices.
> Then it groups households that bent in the same way. Each group is a life moment. Nobody authored it. It was found.

---

## Scene 5. The console (1:40 to 2:00)

**VISUAL**
Screen recording of the discovery console. A ranked list of candidate situations.
First, highlight a row tagged **Existing rule**: *Households preparing to buy a first home.*
Then scroll to the top row, tagged **No existing rule**: *Households preparing for a member to become self-employed.* Beside it: cohort size, and **median lead time: 56 days.**
The reviewer's cursor hovers over *Approve*.

**VOICEOVER**
> Here's how we know it works. Without being told, it rediscovered home buyers. KBC already has a whole ecosystem for that.
> And at the top of the list, something KBC has no rule for. Households preparing for self-employment, visible 56 days before the salary stops.
> A human reviews it. A human approves it. Kate never acts on her own.

---

## Scene 6. What it refuses to show (2:00 to 2:20)

**VISUAL**
Back in the console. A separate panel labelled **Suppressed**. Three cohorts appear, blurred: *Separation*, *Financial distress*, *Care for a relative*. A lock icon over each. The last one carries a small tag: *Protection only.*

**VOICEOVER**
> An engine this good will also find things a bank should never sell against. Separation. Financial distress. A family caring for someone who is ill.
> It found them. It blocked them before any person saw them as an opportunity.
> That isn't a policy slide. It's built into the engine.

---

## Scene 7. The numbers (2:20 to 2:40)

**VISUAL**
Four numbers appear one at a time, large, on a dark screen.
1. **7 of 8** hidden life patterns recovered
2. **56 days** median warning before the salary stops
3. **135 messages instead of 617**, 96% at the right moment
4. **0 messages** to separating or distressed households, vs 152

Beneath them, small text stays on screen: *Synthetic data. This proves the method, not real-world accuracy.*
Then the Aikido security score, before and after.

**VOICEOVER**
> We planted eight life patterns in ten thousand synthetic households and told the engine about none of them. It found 7.
> One honest note: we generated this data ourselves, so this proves the method works, not how accurate it would be on real customers. That's the next step, on KBC's own data.

---

## Scene 8. Close (2:40 to 2:50)

**VISUAL**
The grid of 140 tiles returns. Then a 141st tile appears at the end, without the little human icon. It glows.

**VOICEOVER**
> Kate's first 140 situations were written by people.
> The 141st wrote itself.

**On screen, final card:** *Situation 141* / team name / repo link

---

## Production notes

**Screen recordings needed**
| Scene | What to record | Owner |
|---|---|---|
| 4 | Pipeline visual: household trajectories, bends lighting up, clusters forming | Model track |
| 5 | Console: rediscovery row, then the top uncovered row, cursor on Approve | App track |
| 6 | Console: suppressed panel | App track |
| 7 | Aikido before and after screenshots | Security track |

Scenes 1, 2, 3 and 8 are simple motion graphics. Keynote, Canva or Figma is enough.

**Voice.** Warm, slow, no hype. Leave a full second of silence after "and nobody tells them" in Scene 3, and after "It's built into the engine" in Scene 6. Those pauses do the work.

**Music.** Low ambient bed, drop it out completely for Scene 6.

**Captions.** Burn them in. Judges often watch muted.

**Recording timing.** Record the screen flows at least one hour before the deadline, not in the last hour.

**Three lines that must survive every edit**
1. "Every single one of them was written by a person."
2. "It blocked them before any person saw them as an opportunity."
3. "This proves the method works, not how accurate it would be on real customers."

Cut anything else before cutting these.

---

## Voiceover only (paste straight into ElevenLabs)

A KBC executive moved house last year. A few weeks later, his bank sent him this. It was correct. It was helpful. And it arrived after every decision had already been made.

Kate is one of the best banking assistants in the world. She reacts in more than 140 situations. Every single one of them was written by a person who noticed a pattern. So the limit on how well KBC understands its customers is not data. It is how fast people can think of the next situation.

This is Sofie's household. In March, her husband starts paying an accountant and a social insurance fund. His salary is still arriving. Nothing looks wrong. In June the salary stops. He's self-employed now. The family's hospitalisation cover ends the same day, and nobody tells them. And in about two years, a social contributions bill will arrive that they have no idea is coming. KBC could see all of it, starting in March. There was simply no rule for it, because nobody had written one.

So we built something different. We don't tell it what a life event is. We give it no labels at all. Every household is compared only to its own past. When a household's pattern bends away from its own normal, the engine notices. Then it groups households that bent in the same way. Each group is a life moment. Nobody authored it. It was found.

Here's how we know it works. Without being told, it rediscovered home buyers. KBC already has a whole ecosystem for that. And at the top of the list, something KBC has no rule for. Households preparing for self-employment, visible 56 days before the salary stops. A human reviews it. A human approves it. Kate never acts on her own.

An engine this good will also find things a bank should never sell against. Separation. Financial distress. A family caring for someone who is ill. It found them. It blocked them before any person saw them as an opportunity. That isn't a policy slide. It's built into the engine.

We planted eight life patterns in ten thousand synthetic households and told the engine about none of them. It found 7. One honest note: we generated this data ourselves, so this proves the method works, not how accurate it would be on real customers. That's the next step, on KBC's own data.

Kate's first 140 situations were written by people. The 141st wrote itself.
