/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';

/**
 * Generates a mock survey dataset and returns it as an array of row objects
 * as well as a pre-constructed XLSX workbook object.
 */
export function generateDemoDataset() {
  const headers = [
    '응답 ID',
    'SQ1. 성별',
    'SQ2. 연령',
    'A1. 서비스 전반적 만족도',
    'A2_m1. 서비스 선택 요인 (편리성)',
    'A2_m2. 서비스 선택 요인 (가격)',
    'A2_m3. 서비스 선택 요인 (품질)',
    'A2_m4. 서비스 선택 요인 (추천)',
    'B1. 주 이용 쇼핑몰',
    'B2_m1. 부 이용 쇼핑몰 1순위',
    'B2_m2. 부 이용 쇼핑몰 2순위',
    'B2_m3. 부 이용 쇼핑몰 3순위',
    'C1. 서비스 사용성 평가 (사용하기 쉽다)',
    'C1_n2. 서비스 사용성 평가 (반응 속도가 빠르다)',
    'C1_n3. 서비스 사용성 평가 (오류가 발생하지 않는다)',
    'C1_n4. 서비스 사용성 평가 (디자인이 세련되었다)',
    'C1_n5. 서비스 사용성 평가 (필요한 기능이 모두 있다)',
    'D1. 최근 광고 노출 여부',
    'D1_n2. 브랜드 선호도 점수 (단독 문항)',
    '(TEXT) E1. 건의사항 및 서비스 개선 희망 의견',
  ];

  const rows: any[] = [];
  const totalRespondents = 150;

  for (let i = 1; i <= totalRespondents; i++) {
    // SQ1: Gender (1: Male [45%], 2: Female [55%])
    const sq1 = Math.random() < 0.45 ? 1 : 2;

    // SQ2: Age (1: <=19 [10%], 2: 20-29 [25%], 3: 30-39 [30%], 4: 40-49 [20%], 5: 50-59 [10%], 6: >=60 [5%])
    const ageRand = Math.random();
    let sq2 = 3; // default
    if (ageRand < 0.10) sq2 = 1;
    else if (ageRand < 0.35) sq2 = 2;
    else if (ageRand < 0.65) sq2 = 3;
    else if (ageRand < 0.85) sq2 = 4;
    else if (ageRand < 0.95) sq2 = 5;
    else sq2 = 6;

    // A1: Single-select satisfaction rating (1 to 5)
    // Satisfied generally higher for females
    let a1 = 3;
    const satisfyRand = Math.random();
    if (sq1 === 2) { // Female
      if (satisfyRand < 0.10) a1 = 5;      // 매우 만족
      else if (satisfyRand < 0.50) a1 = 4; // 만족
      else if (satisfyRand < 0.80) a1 = 3; // 보통
      else if (satisfyRand < 0.95) a1 = 2; // 불만족
      else a1 = 1;                         // 매우 불만족
    } else { // Male
      if (satisfyRand < 0.08) a1 = 5;
      else if (satisfyRand < 0.42) a1 = 4;
      else if (satisfyRand < 0.75) a1 = 3;
      else if (satisfyRand < 0.92) a1 = 2;
      else a1 = 1;
    }

    // A2_m1 ~ m4: Multi-select (binary, column-per-option)
    // 1 if selected, empty if not.
    // Convenience (m1), Price (m2), Quality (m3), Referral (m4)
    // Young people prefer Price, older prefer Quality
    const a2_m1 = Math.random() < 0.65 ? 1 : '';
    const a2_m2 = (sq2 <= 2 ? Math.random() < 0.80 : Math.random() < 0.45) ? 1 : '';
    const a2_m3 = (sq2 >= 4 ? Math.random() < 0.75 : Math.random() < 0.50) ? 1 : '';
    const a2_m4 = Math.random() < 0.25 ? 1 : '';

    // B1: Main Shopping Mall (1 to 5)
    let b1 = Math.floor(Math.random() * 5) + 1;
    if (sq2 === 2 && Math.random() < 0.6) b1 = 2; // Coupang very popular for 20s
    if (sq2 >= 5 && Math.random() < 0.5) b1 = 4; // 11st popular for 50s+

    // B2_m1 ~ m3: Multi-select (categorical, value-per-column)
    // Values are 1 to 5 representing secondary malls. Ensure no duplicates in same respondent.
    const secondaryMalls = [1, 2, 3, 4, 5].filter(m => m !== b1);
    // Shuffle secondary malls
    for (let j = secondaryMalls.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [secondaryMalls[j], secondaryMalls[k]] = [secondaryMalls[k], secondaryMalls[j]];
    }
    const chooseCount = Math.floor(Math.random() * 4); // Choose 0 to 3 malls
    const b2_m1 = chooseCount >= 1 ? secondaryMalls[0] : '';
    const b2_m2 = chooseCount >= 2 ? secondaryMalls[1] : '';
    const b2_m3 = chooseCount >= 3 ? secondaryMalls[2] : '';

    // C1, C1_n2 ~ n5: Scale rating (1 to 5)
    // Scale ratings correlate with general satisfaction A1
    const baseSatisfaction = a1; // 1 to 5
    const getRating = (base: number) => {
      const dev = Math.random();
      let rating = base;
      if (dev < 0.15) rating = Math.max(1, base - 1);
      else if (dev < 0.30) rating = Math.min(5, base + 1);
      return rating;
    };

    const c1 = getRating(baseSatisfaction);
    const c1_n2 = getRating(baseSatisfaction);
    const c1_n3 = getRating(Math.max(1, baseSatisfaction - 1)); // reliability slightly lower
    const c1_n4 = getRating(Math.min(5, baseSatisfaction + 1)); // design slightly higher
    const c1_n5 = getRating(baseSatisfaction);

    // D1, D1_n2: Single selects
    // Testing the rule that a single _n2 suffix is treated as single select, not scale
    const d1 = Math.random() < 0.70 ? 1 : 2; // 1: Yes, 2: No
    const d1_n2 = Math.floor(Math.random() * 5) + 1; // 1 to 5 stars

    // E1: Subjective Text comments
    const textComments = [
      "배송이 조금 더 빨랐으면 좋겠어요. 배송 속도 개선 부탁드립니다.",
      "가격이 다른 곳보다 조금 비싸네요. 첫 가입 할인 쿠폰이나 정기 혜택이 강화되면 좋겠습니다.",
      "앱 디자인과 UI가 깔끔하고 직관적이어서 사용하기 매우 편리합니다.",
      "메뉴와 카테고리가 너무 복잡해서 원하는 상품을 한 번에 찾기 어렵습니다.",
      "가끔 검색 시 로딩 시간이 길어지거나 화면이 멈추는 현상이 있어 수정이 필요해 보여요.",
      "고객센터 일대일 문의 답변이 너무 느려서 급할 때 답답합니다.",
      "배송이 약속된 시간보다 늦게 도착하는 경우가 잦습니다. 개선해 주세요.",
      "가성비가 아주 좋습니다. 가격 대비 전반적인 품질과 디자인에 만족합니다.",
      "자주 쓰는 메뉴를 즐겨찾기처럼 모아볼 수 있는 개인화 기능이 있으면 좋겠네요.",
      "결제 단계에서 오류가 가끔 발생해서 새로고침해야 하는 번거로움이 있습니다."
    ];
    const e1 = textComments[i % textComments.length];

    const rowData: Record<string, any> = {
      [headers[0]]: i,
      [headers[1]]: sq1,
      [headers[2]]: sq2,
      [headers[3]]: a1,
      [headers[4]]: a2_m1,
      [headers[5]]: a2_m2,
      [headers[6]]: a2_m3,
      [headers[7]]: a2_m4,
      [headers[8]]: b1,
      [headers[9]]: b2_m1,
      [headers[10]]: b2_m2,
      [headers[11]]: b2_m3,
      [headers[12]]: c1,
      [headers[13]]: c1_n2,
      [headers[14]]: c1_n3,
      [headers[15]]: c1_n4,
      [headers[16]]: c1_n5,
      [headers[17]]: d1,
      [headers[18]]: d1_n2,
      [headers[19]]: e1,
    };

    rows.push(rowData);
  }

  // Create an XLSX workbook
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '설문조사_결과_데이터');

  // Generate buffer
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  return {
    headers,
    rows,
    blob,
    filename: '설문조사_데모_데이터_150명.xlsx',
  };
}
