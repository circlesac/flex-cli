# Flex 평가(Check-in) API — 평가자 작성 플로우 리버스 엔지니어링

> 목적: `flexhr` 에 **평가 작성(하향 평가) 명령**을 붙이기 위한 flex.team 평가 API 전체 분석.
> 방법: 실제 로그인 세션 쿠키 주입 후 평가 작성 화면을 Playwright 로 구동하며 XHR 전수 캡처 + curl read-only 탐침.
> 캡처일: 2026-06-04. 대상 평가: **2026-05 Q1 Quarterly Check-in** (TOP_DOWN depth 1).
> 검증: 모든 GET/PUT 응답 200 실측. 제출(완료) 엔드포인트만 비가역이라 의도적으로 미실행.

---

## 0. 요약 (TL;DR)

평가 작성은 **"폼(user-form) 답안(user-answer)을 PUT 으로 채우는" 단순 구조**다. 평가지의 모든 항목(9개 Core Value 라디오, 최종등급, 서술형 2개)이 전부 같은 답안 엔드포인트 한 개로 저장된다.

```
PUT /api/v2/form/customers/{cust}/users/{reviewer}/user-forms/{userFormId}/user-answers/{userAnswerId}
body: { "type": "<SINGLE_SELECT|GRADE|PLAIN_TEXT>", "answer": { ... } }
```

ID 는 전부 평가 작성 화면 진입 시 내려오는 폼 GET 응답에 들어있으므로, CLI 는 **(1) 대상자 목록 조회 → (2) 대상자별 폼 2개 GET → (3) 항목별 답안 PUT → (4) CUSTOM 등급 PATCH → (5) 제출 POST** 순서로 동작하면 된다.

> ⚠️ 핵심 함정: 최종등급은 **두 군데** 다 채워야 한다 — form2 의 GRADE 답안 PUT(폼 표시용) + CUSTOM 팩터 reviewer-grade PATCH(제출 게이트). PATCH 를 빠뜨리면 "등급을 선택해 주세요" 로 제출이 막힌다. (§2-4b)

---

## 1. 인증 / 헤더

기존 `flex-cli` 쿠키 인증(`src/lib/auth.ts`)을 **그대로 재사용**한다. 평가 API 도 동일하게 `JSESSIONID` + `AID`(JWT) + `DEVICE_ID` 쿠키만 있으면 된다.

`src/lib/client.ts` 의 `buildHeaders()` 와 차이점 **하나**:

| 헤더 | docs/users 등 | **평가** |
|------|--------------|---------|
| `flexteam-mf-appname` | `remotes-people` | **`remotes-evaluation`** |

> `remotes-people` 으로 `/api/v3/evaluation/menu` 를 치면 `403 PERM_403_000`. 단, `/api/v2/form/...` 답안 엔드포인트는 appname 검사가 느슨하나, **안전하게 `remotes-evaluation` 로 고정**할 것. 나머지 헤더(`x-flex-aid`, `Cookie`, `flexteam-productcode: FLEX`, `flexteam-locale: ko`)는 동일.

`customerUuid`(=`customerIdHash`)와 `reviewerIdHash`(=내 `userUuid`)는 둘 다 AID JWT 페이로드에서 나온다 (`auth.ts` 가 이미 `customerUuid` 파싱, `userUuid` 도 같은 payload 의 `userUuid` 필드).

---

## 2. 엔드포인트 시퀀스 (appname=remotes-evaluation)

상수: `cust=customerIdHash`, `me=reviewerIdHash`, `evalId`, `step=TOP_DOWN`, `depth=1`.

### 2-1. "내가 작성할 평가" 찾기 — 할 일(todo)에서 evalId 추출

```
POST /action/v3/todo/assigned-todos/search?size=10&sort=DESC&orderBy=UPDATED_AT
     (appname: remotes-home)
body: {"condition":"AND","filter":{"statuses":{"selections":["TODO","IN_PROGRESS"],"condition":"INCLUDE_ALL"}}}
```

응답 `assignedTodos[]` 중 `type=="WRITE_EVALUATION_STEP_REQUEST"` 인 항목:
- `reference.referenceJson.evaluationId` → **evalId**
- `reference.referenceJson.evaluationStepType` → `TOP_DOWN`
- `reference.referenceJson.evaluationStepDepth` → `1`
- `due` → 마감(UTC)
- `mobileLink`: `flexteam://route/evaluation/{evalId}/write/TOP_DOWN/1`

> 또는 평가 ID 를 인자로 직접 받아도 됨. todo 조회는 "지금 작성 대기중인 평가 자동 발견" 용도.

### 2-2. 대상자(피평가자) 목록 + 폼 ID

```
GET /action/v3/evaluation/{evalId}/step/{step}/depth/{depth}/getEvaluationStepNeedsWriting
```

응답:
- `mappings[]`: 각 원소가 한 명의 피평가자
  - `revieweeIdHash`, `reviewerIdHash`(=나), `writingStatus`(`BEFORE_START`/`IN_PROGRESS`/...)
  - `userFormIds[]` — **대상자당 2개** (Core Value 폼 + 최종/서술 폼). **순서 가정 금지** — 폼 GET 후 `reference.referenceData.factor` 로 분류(`COMPETENCY` vs `CUSTOM`).
- `revieweeUsers[]`: 이름/이메일 (id→이름 매핑)

### 2-3. 폼 + 현재 답안 (한 번에)

```
GET /api/v2/form/customers/{cust}/users/{me}/user-forms/{userFormId}?compositeBlocks=true
```

`compositeBlocks=true` 가 핵심 — **블록(질문) + 각 블록의 현재 `userAnswer`(userAnswerId 포함)를 한 응답에 다 준다.** 별도 답안 조회 불필요.

응답 구조:
- `title`, `reference.referenceData.factor` (`COMPETENCY` | `CUSTOM`)
- `userBlocks[]`:
  - `itemType=="SUBTITLE"` → 섹션 헤더(예: "Vision Vector"). 무시.
  - `itemType=="QUESTION"`:
    - `question.questionType`: `SINGLE_SELECT` | `GRADE` | `PLAIN_TEXT`
    - `question.title`, `question.required`
    - `question.elements[]`: 선택지 — `{ elementId, label, gradeItemId? }`
    - `userAnswer.userAnswerId` ← **PUT URL 에 쓸 답안 ID**
    - `userAnswer.answer` ← 현재 저장값(없으면 null)

### 2-4. 답안 저장 (PUT) — 모든 항목 공통

```
PUT /api/v2/form/customers/{cust}/users/{me}/user-forms/{userFormId}/user-answers/{userAnswerId}
```

| questionType | body |
|---|---|
| `SINGLE_SELECT` (9 Core Value) | `{"type":"SINGLE_SELECT","answer":{"elementId":"<elementId>"}}` |
| `GRADE` (최종등급) | `{"type":"GRADE","answer":{"elementId":"<elementId>"}}` |
| `PLAIN_TEXT` (서술형) | `{"type":"PLAIN_TEXT","answer":{"text":"<문자열>"}}` |

- 응답: `{"userAnswer":{...,"answer":{...}}}` (200).
- **멱등** — 같은 항목에 다시 PUT 하면 덮어씀. 초안(draft) 이라 제출 전까지 몇 번이든 수정 가능.

### 2-4b. ⚠️ CUSTOM 팩터 등급 PATCH — 제출을 막는 진짜 등급 (필수)

**함정**: form2 의 `Q[GRADE]` "Quarterly Check-in 최종등급" user-answer 를 PUT 해도 그건 **폼 답안일 뿐**, 평가의 **CUSTOM 팩터 reviewer-grade 는 별개**다. 이걸 안 채우면 화면에 "등급을 선택해 주세요" 가 뜨고 **제출이 막힌다**. 실제 UI 에서 하단 등급을 클릭하면 form-answer PUT 과 별도로 이 PATCH 가 같이 나간다.

```
GET   /api/v3/evaluation/{evalId}/reviewee/{reviewee}/reviewer/{me}/grades/step/{step}/depth/{depth}/factorType/CUSTOM   # 현재 등급 조회
PATCH /api/v3/evaluation/{evalId}/reviewee/{reviewee}/reviewer/{me}/grades/step/{step}/depth/{depth}/factorType/CUSTOM
body: {"gradeItemId":"<gradeItemId>","patchFields":["GRADE_ITEM_IDENTITY"]}
```

`gradeItemId` 는 §3 의 4등급(`…tfq`=A탁월 / `…tfr`=B / `…tfs`=C / `…tft`=Poor). 응답 200.
→ **CLI 는 form2 GRADE 답안 PUT 과 이 PATCH 를 둘 다 해야 한다** (UI 와 동일하게).

### 2-5. 제출 / 완료 (✅ 검증, 비가역)

```
POST /action/v3/evaluation/{evalId}/steps/{step}/depth/{depth}/reviewers/{me}/reviewee/{reviewee}/submission
body: {"type":"SUBMIT"}
```

- 응답 200 → `getEvaluationStepNeedsWriting` 의 `writingStatus` 가 `IN_PROGRESS` → **`SUBMITTED`**, 해당 평가 todo 사라짐.
- **선결 조건**: 9 Core Value(필수) + CUSTOM 등급 PATCH(2-4b) 가 모두 채워져 있어야 통과. 하나라도 비면 400/검증 실패.
- URL 주의: 경로 세그먼트가 `steps`(복수) + `reviewers`(복수) 로, 다른 엔드포인트의 `step`/`reviewer`(단수)와 다름.
- **비가역** — 평가 기간 종료 후 수정 불가. CLI 는 `submit` 를 별도 명령 + 확인 프롬프트로 분리할 것.

---

## 3. 데이터 모델 — 이번 사이클 실측값 (worked example)

```
cust(customerIdHash) = 5xEwm1Qy0b
me(reviewerIdHash)   = wVz9LNbn03   (YG Park)
evalId               = 01kspp2s6mdhe073naczwbf67v   "2026-05 Q1 Quarterly Check-in"
step / depth         = TOP_DOWN / 1
마감                  = 2026-06-04T14:30:00Z (=6/4 23:30 KST)
```

### 대상자 → userForm

| 피평가자 | revieweeIdHash | COMPETENCY 폼(Core Value) | CUSTOM 폼(최종+서술) |
|---|---|---|---|
| Ab Yoon (윤병현) | `Kq05JOZKzv` | `01ksprn19vss1yxe2vjan64zmf` | `01ksprn1e3eb1xdm9cssbd2992` |
| Chester Lee (이기원) | `53EjM469zr` | `01ksprn0q25jgh2pkyvg69mq2c` | `01ksprn0vgrjtmszgr9q37ch0c` |
| Doah Oh (오현아) | `MV0a4K9l8Z` | `01ksprn33r27f6qwgx7ftqy591` | `01ksprn38anpdq1t4q0j4rgq5r` |

> COMPETENCY/CUSTOM 매핑은 위 AB 기준 실측. 다른 2명은 `userFormIds` 순서가 동일하다는 보장 없으니 **폼 GET 후 factor 로 판별**.

### COMPETENCY 폼 "Core Value 2.0" — 9개 SINGLE_SELECT (전부 required)

섹션/질문 순서:
1. (Vision Vector) **Champion the Vision**
2. (Vision Vector) **Stick to the highest standard - AI first by default**
3. (Vision Vector) **Lead the way we work - AI Native Organization**
4. (Performance) **Awesome impact**
5. (Performance) **Act for a reason**
6. (Performance) **Deliver quality on time**
7. (Teamwork) **Be a solution provider**
8. (Teamwork) **Move fast together**
9. (Teamwork) **Transparent communication**

각 질문 선택지 라벨: `Super` / `Best` / `Very Good` / `Acceptable` / `Poor`.
**주의: elementId 는 질문마다 다름** (선택지가 질문에 종속). 라벨로 찾아 매핑할 것. 예) "Champion the Vision":

| 라벨 | elementId |
|---|---|
| Super | `01kspp8swqg3zvh6b1p04rmbgx` |
| Best | `01kspp8swqg3zvh6b1p04rmbgy` |
| Very Good | `01kspp8swqg3zvh6b1p04rmbgz` |
| Acceptable | `01kspp8swqg3zvh6b1p04rmbh0` |
| Poor | `01kspp8swqg3zvh6b1p04rmbh1` |

### CUSTOM 폼 "Quarterly Check-in 최종" — GRADE 1 + PLAIN_TEXT 2

- **Q[GRADE] "Quarterly Check-in 최종등급"** (required). 선택지 = 분기 4등급 (`elementId` → `gradeItemId`):

| 라벨 | elementId | gradeItemId | score |
|---|---|---|---|
| 이번 분기는 기대 이상의 경기력을 보여주었어요. (**A 탁월**) | `01kspp8t5kcdngbw29t0ay4r90` | `…tfq` | 4.0 |
| 이번 분기는 기대 했던 경기력을 보여주었어요. (B) | `01kspp8t5kcdngbw29t0ay4r8z` | `…tfr` | 3.0 |
| …기대했던 경기력을 보여주지 못했습니다. (C) | `01kspp8t5kcdngbw29t0ay4r8y` | `…tfs` | 2.0 |
| Poor | `01kspp8t5kcdngbw29t0ay4r8x` | `…tft` | 1.0 |

- **Q[PLAIN_TEXT] "지난 3개월 동안 잘해온 점"** (optional)
- **Q[PLAIN_TEXT] "앞으로 개선이 필요한 점"** (optional)

> 즉 Flex 폼 = 9 Core Value(5지선다) + 최종등급(4지선다) + 서술 2개. (Talent 시트의 J~R 9항/I열과 1:1 대응. 시트는 취합용, Flex 가 실제 평가지.)

---

## 4. CLI (`flexhr checkin`) — ✅ 구현됨

구현: `src/lib/evaluation.ts` (API) + `src/commands/checkin/{list,show,set,submit}.ts`.
헤더는 `remotes-evaluation` 격리를 위해 client.ts 의 buildHeaders 와 별도(evaluation.ts 자체 헤더 빌더).

```
flexhr checkin list                          # 작성 대기 평가(todo 자동 발견) + 대상자/진행상태
flexhr checkin show <reviewee>               # 대상자 평가지(질문+현재답안)
flexhr checkin set --payload <json>          # 답안 일괄 PUT + 등급 PATCH (초안)
flexhr checkin submit <reviewee>             # 제출(비가역) — 확인 프롬프트, --yes 로 생략
flexhr checkin submit --all                  # 미제출 전원 제출
# 공통: --eval <id> --step <TYPE> --depth <n> 로 평가 직접 지정 (생략 시 todo 자동)
```

`set` 페이로드 예시 → `docs/checkin-example.json`:

```json
{
  "reviewee": "Ab Yoon",
  "grade": "A",
  "coreValuesAll": "Best",
  "coreValues": { "Awesome impact": "Super" },
  "strengths": "...",
  "improvements": "..."
}
```

- `grade`: `A`/`B`/`C`/`Poor` → systemScore(4/3/2/1)로 gradeItem 매핑. **form2 GRADE 답안 PUT + CUSTOM 등급 PATCH 둘 다 자동 수행**.
- `coreValuesAll`: 9항 일괄 라벨. `coreValues` 로 개별 질문 오버라이드.
- 안전장치: `set` 는 초안만(제출 안 함), SUBMITTED 대상은 거부. `submit` 는 필수항목+등급 preflight 검증 후 확인 프롬프트.

### 4-1. 원래 설계 메모 (입력 파일 형식 변천)

초기엔 YAML 도 고려했으나 flex-cli 의존성 최소화(citty 단독) 위해 JSON 채택. 라벨 기반(사람이 읽고 쓰기 쉬움), CLI 가 elementId 로 해석:

```yaml
reviewee: Ab Yoon            # 이름 or revieweeIdHash
grade: A                     # A/B/C/Poor → 최종등급 GRADE
coreValues:                  # 9항, 라벨(Super/Best/Very Good/Acceptable/Poor)
  Champion the Vision: Best
  Stick to the highest standard - AI first by default: Best
  ... (9개)
strengths: |                 # "지난 3개월 동안 잘해온 점"
  ...
improvements: |             # "앞으로 개선이 필요한 점"
  ...
```

해석 알고리즘:
1. `getEvaluationStepNeedsWriting` → reviewee 이름→idHash, userFormIds.
2. 두 폼 GET(`compositeBlocks=true`) → 질문 title→{userFormId, userAnswerId, questionType, label→elementId} 인덱스 구축.
3. YAML 값을 라벨→elementId 로 변환 후 항목별 PUT.
4. `submit` 는 별도 명령 + `--yes` 없으면 확인.

안전장치:
- 기본은 초안 저장만. 제출은 명시적 명령 + 확인(평가 기간 종료 후 비가역).
- PUT 전 현재 답안과 diff 출력(덮어쓰기 가시화).
- 9 required Core Value + 최종등급 미입력 시 submit 거부.

구현 위치: `src/commands/checkin/{index,list,show,set,submit}.ts`, API 는 `src/lib/client.ts` 에 `evaluation*` 함수 추가(appname 오버라이드).

---

## 5. 캡처 환경 메모 (재현용)

- 쿠키 추출: `bun run src/lib/auth.ts` 의 `extractBrowserCookies()` 재사용 → Playwright 컨텍스트에 `.flex.team` 쿠키 주입.
- 평가 작성 화면은 SPA 라우트 `/evaluation/{evalId}/write/TOP_DOWN/1` 직접 진입 시 빈 화면(404 유사) — **홈 피드의 "하향 1차 평가 작성 요청" todo 클릭**으로 진입해야 폼 로드됨.
- MF 앱: 평가 작성=`remotes-evaluation`, 홈 todo=`remotes-home`, 프로필 평가탭=`remotes-user-profile`.
