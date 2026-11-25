/**
 * Statistical calculations module for Course Evaluation 640-394
 * Strictly conforms to PSU Faculty of Nursing evaluation requirements:
 * 1. Mean (ค่าเฉลี่ย) calculated strictly from numeric scores 1-5.
 * 2. If no numeric scores, mean is null (displayed as "ไม่มีข้อมูลคะแนน" instead of 0).
 * 3. Percentages of each score (1-5) use total respondents of 1-5 (N_numeric) as denominator.
 * 4. N/A is tracked and displayed separately, never counted as 0 or in mean.
 * 5. Low satisfaction (คะแนน 1-3) count and % uses N_numeric as denominator.
 * 6. Questions not in version (e.g. 4.4 and 4.5 for legacy v1 submissions) are marked 'not_in_version'
 *    and NEVER counted in the denominator or respondents.
 * 7. No automated cross-ward or cross-category pooling.
 */

function calculateItemStats(questionDef, answersList) {
  // Filter answers for this question
  const answers = answersList.filter(a => a.question_code === questionDef.code);

  let count1 = 0;
  let count2 = 0;
  let count3 = 0;
  let count4 = 0;
  let count5 = 0;
  let countNA = 0;
  let countNotTrained = 0;
  let countNotInVersion = 0;
  let comments = [];

  for (const a of answers) {
    if (a.status === 'not_in_version') {
      countNotInVersion++;
      continue;
    }
    if (a.status === 'not_trained') {
      countNotTrained++;
      continue;
    }
    if (a.status === 'na') {
      countNA++;
      if (a.comment && a.comment.trim()) {
        comments.push({
          score: 'N/A',
          comment: a.comment.trim(),
          section: a.section,
          submission_id: a.submission_id,
          metadata: a.metadata_json ? JSON.parse(a.metadata_json) : null
        });
      }
      continue;
    }
    if (a.status === 'answered' && typeof a.score === 'number') {
      if (a.score === 1) count1++;
      else if (a.score === 2) count2++;
      else if (a.score === 3) count3++;
      else if (a.score === 4) count4++;
      else if (a.score === 5) count5++;

      if (a.comment && a.comment.trim()) {
        comments.push({
          score: a.score,
          comment: a.comment.trim(),
          section: a.section,
          submission_id: a.submission_id,
          metadata: a.metadata_json ? JSON.parse(a.metadata_json) : null
        });
      }
    }
  }

  const numericCount = count1 + count2 + count3 + count4 + count5;
  const sumScore = (1 * count1) + (2 * count2) + (3 * count3) + (4 * count4) + (5 * count5);
  const mean = numericCount > 0 ? (sumScore / numericCount) : null;

  // Standard deviation
  let standardDeviation = null;
  if (numericCount > 1 && mean !== null) {
    const variance = (
      Math.pow(1 - mean, 2) * count1 +
      Math.pow(2 - mean, 2) * count2 +
      Math.pow(3 - mean, 2) * count3 +
      Math.pow(4 - mean, 2) * count4 +
      Math.pow(5 - mean, 2) * count5
    ) / (numericCount - 1);
    standardDeviation = Math.sqrt(variance);
  }

  // Percentages calculated with numericCount as denominator
  const p1 = numericCount > 0 ? ((count1 / numericCount) * 100) : 0;
  const p2 = numericCount > 0 ? ((count2 / numericCount) * 100) : 0;
  const p3 = numericCount > 0 ? ((count3 / numericCount) * 100) : 0;
  const p4 = numericCount > 0 ? ((count4 / numericCount) * 100) : 0;
  const p5 = numericCount > 0 ? ((count5 / numericCount) * 100) : 0;

  // Low satisfaction (1-3)
  const lowCount = count1 + count2 + count3;
  const lowPercent = numericCount > 0 ? ((lowCount / numericCount) * 100) : 0;

  // Total respondents who actually faced this question
  const totalEligible = numericCount + countNA;

  return {
    code: questionDef.code,
    section_num: questionDef.section_num,
    category: questionDef.category,
    title_th: questionDef.title_th,
    subtitle_th: questionDef.subtitle_th,
    station_code: questionDef.station_code,
    station_name_th: questionDef.station_name_th,
    hospital_code: questionDef.hospital_code,
    ward_code: questionDef.ward_code,
    is_rating: questionDef.is_rating,
    introduced_in_version: questionDef.introduced_in_version,
    sort_order: questionDef.sort_order,
    
    // Counts
    numericCount,         // N (คำนวณจากคะแนน 1-5)
    countNA,              // จำนวนเลือก N/A
    countNotTrained,      // จำนวนไม่ได้ขึ้นฝึก
    countNotInVersion,    // จำนวนไม่มีข้อประเมินนี้ในแบบประเมินฉบับที่ตอบ
    totalEligible,        // จำนวนผู้มีสิทธิ์ตอบ (numeric + NA)

    // Score distribution
    scoreCounts: {
      1: count1,
      2: count2,
      3: count3,
      4: count4,
      5: count5
    },
    // Percentages (denominator = numericCount)
    scorePercents: {
      1: Number(p1.toFixed(2)),
      2: Number(p2.toFixed(2)),
      3: Number(p3.toFixed(2)),
      4: Number(p4.toFixed(2)),
      5: Number(p5.toFixed(2))
    },

    // Summary Metrics
    mean: mean !== null ? Number(mean.toFixed(2)) : null,
    meanDisplay: mean !== null ? mean.toFixed(2) : 'ไม่มีข้อมูลคะแนน',
    sd: standardDeviation !== null ? Number(standardDeviation.toFixed(2)) : null,
    sdDisplay: standardDeviation !== null ? standardDeviation.toFixed(2) : '-',
    
    // Low score stats (1-3)
    lowCount,
    lowPercent: Number(lowPercent.toFixed(2)),

    // Comments associated with this item
    commentsCount: comments.length,
    comments
  };
}

module.exports = {
  calculateItemStats
};
