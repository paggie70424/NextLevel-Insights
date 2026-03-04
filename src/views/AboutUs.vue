<template>
  <div class="about-us">
    <div class="page-header">
      <h1 class="page-title">About NextLevel Insights</h1>
      <p class="page-subtitle">Unified student wellbeing and academic analytics platform.</p>
    </div>

    <!-- 1. What is NextLevel Insights -->
    <div class="content-section">
      <h2>What is NextLevel Insights?</h2>
      <p>
        NextLevel Insights is a unified student wellbeing and academic analytics platform that integrates data from multiple sources into one secure, student-controlled system. It provides insights to help students manage their wellbeing and academic success, while enabling educators to provide timely, informed support.
      </p>
      <div class="integration-list">
        <div class="integration-item">📚 Learning systems (Moodle, Canvas)</div>
        <div class="integration-item">⌚ Wearables (Apple Watch, WHOOP, Fitbit)</div>
        <div class="integration-item">💤 Wellbeing inputs (Sleep, Mood, Stress)</div>
        <div class="integration-item">🏛 Institutional systems (Grades, Attendance)</div>
      </div>
    </div>

    <!-- 2. Core Principle -->
    <div class="content-section highlight-section">
      <h2>Core Principle: Student-Controlled Data Ownership</h2>
      <p>NextLevel Insights is built on explicit consent and permission control. Students have full authority over their data:</p>
      <ul class="feature-list">
        <li><strong>Own their data</strong></li>
        <li><strong>Choose what to share</strong></li>
        <li><strong>Choose who can access it</strong></li>
        <li><strong>Can revoke access at any time</strong></li>
      </ul>
      <p class="note">No data is shared without explicit authorization.</p>
    </div>

    <!-- 3. Target Audiences -->
    <div class="content-section">
      <h2>Target Audiences & Purpose</h2>
      <div class="audience-grid">
        
        <!-- Student Card -->
        <div class="audience-card student-card">
          <div class="card-header">
            <span class="icon">🎓</span>
            <h3>For Students</h3>
          </div>
          <div class="card-body">
            <h4>Purpose</h4>
            <ul>
              <li><strong>Monitor Wellbeing:</strong> Sleep, Stress, Mood, Recovery.</li>
              <li><strong>Track Academics:</strong> Assignments, Engagement, Attendance.</li>
              <li><strong>Receive Warnings:</strong> "Assignment due in 2 days", "Sleep quality declined".</li>
              <li><strong>Self-Reflection:</strong> Correlate sleep with grades, stress with deadlines.</li>
            </ul>
            <h4>Benefits</h4>
            <p>Self-awareness, better time management, and personalized wellbeing optimization.</p>
          </div>
        </div>

        <!-- Admin Card -->
        <div class="audience-card admin-card">
          <div class="card-header">
            <span class="icon">💼</span>
            <h3>For Admin / Staff</h3>
          </div>
          <div class="card-body">
            <h4>Purpose</h4>
            <ul>
              <li><strong>Monitor Trends:</strong> Prolonged stress, sleep deprivation (with permission).</li>
              <li><strong>Track Engagement:</strong> Low LMS activity, missed deadlines.</li>
              <li><strong>Early Intervention:</strong> Contact students before crises occur.</li>
            </ul>
            <h4>Benefits</h4>
            <p>Early detection of at-risk students, data-informed support, and improved retention.</p>
          </div>
        </div>

      </div>
    </div>

    <!-- 4. Permission Model -->
    <div class="content-section">
      <h2>Permission & Privacy Model</h2>
      <p>NextLevel Insights uses granular permission control. Students can toggle access for each data type independently.</p>
      
      <div class="permission-table-container">
        <table class="permission-table">
          <thead>
            <tr>
              <th>Data Type</th>
              <th>Shared With Lecturer</th>
              <th>Shared With Wellbeing Team</th>
              <th>Private</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Academic Engagement</td>
              <td class="check">✔</td>
              <td class="check">✔</td>
              <td></td>
            </tr>
            <tr>
              <td>Sleep Data</td>
              <td></td>
              <td class="check">✔</td>
              <td></td>
            </tr>
            <tr>
              <td>Mood Data</td>
              <td></td>
              <td></td>
              <td class="check">✔</td>
            </tr>
            <tr>
              <td>Activity</td>
              <td class="check">✔</td>
              <td class="check">✔</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 5. Platform Architecture -->
    <div class="content-section">
      <h2>Platform Architecture</h2>
      <p>
        <strong>One Platform, Different Views.</strong> The system detects your role upon login and loads the appropriate dashboard.
      </p>
      <div class="architecture-visual">
        <div class="arch-box">Single Platform</div>
        <div class="arch-arrow">➡</div>
        <div class="arch-box">Login (Student / Admin)</div>
        <div class="arch-arrow">➡</div>
        <div class="arch-box">Role-Specific Dashboard</div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.about-us {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
}

.page-header {
  margin-bottom: 4rem;
  text-align: center;
}

.page-title {
  font-size: 3rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
  color: var(--c-brand); /* Using brand color for title */
  background: -webkit-linear-gradient(45deg, var(--c-brand), #42b983);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.page-subtitle {
  color: var(--c-text-light);
  font-size: 1.5rem;
  font-weight: 300;
}

.content-section {
  margin-bottom: 4rem;
}

.content-section h2 {
  font-size: 2rem;
  margin-bottom: 1.5rem;
  color: var(--c-text);
  border-left: 5px solid var(--c-brand);
  padding-left: 1rem;
}

.content-section p {
  font-size: 1.1rem;
  line-height: 1.7;
  color: var(--c-text);
  margin-bottom: 1rem;
}

/* Integration List */
.integration-list {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 1.5rem;
}

.integration-item {
  background: var(--c-bg-light);
  padding: 0.75rem 1.25rem;
  border-radius: 50px;
  font-weight: 600;
  color: var(--c-text);
  border: 1px solid var(--c-border);
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

/* Highlight Section */
.highlight-section {
  background: linear-gradient(to right, rgba(66, 185, 131, 0.05), rgba(66, 185, 131, 0.15));
  padding: 2rem;
  border-radius: 16px;
  border: 1px solid rgba(66, 185, 131, 0.2);
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.feature-list li {
  background: white;
  padding: 1rem;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  color: var(--c-brand);
}

.note {
  font-style: italic;
  font-weight: 600;
  text-align: center;
  color: var(--c-text);
}

/* Target Audiences Grid */
.audience-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 2rem;
}

.audience-card {
  background: var(--c-bg);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0,0,0,0.08);
  border: 1px solid var(--c-border);
  transition: transform 0.2s;
}

.audience-card:hover {
  transform: translateY(-5px);
}

.card-header {
  padding: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid var(--c-border);
}

.student-card .card-header {
  background: linear-gradient(135deg, #e0f2f1, #b2dfdb);
}

.admin-card .card-header {
  background: linear-gradient(135deg, #f3e5f5, #e1bee7);
}

.card-header .icon {
  font-size: 2rem;
}

.card-header h3 {
  margin: 0;
  font-size: 1.5rem;
  color: #333;
}

.card-body {
  padding: 1.5rem;
}

.card-body h4 {
  color: var(--c-brand);
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.1rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card-body ul {
  padding-left: 1.25rem;
  margin-bottom: 1.5rem;
}

.card-body li {
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
  line-height: 1.5;
}

/* Permission Table */
.permission-table-container {
  overflow-x: auto;
  margin-top: 1.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.05);
}

.permission-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}

.permission-table th, .permission-table td {
  padding: 1rem;
  text-align: center;
  border-bottom: 1px solid var(--c-border);
}

.permission-table th {
  background: var(--c-bg-light);
  font-weight: 600;
  color: var(--c-text);
  text-transform: uppercase;
  font-size: 0.85rem;
  letter-spacing: 0.5px;
}

.permission-table td {
  color: var(--c-text);
}

.permission-table td:first-child {
  text-align: left;
  font-weight: 600;
  padding-left: 1.5rem;
}

.check {
  color: var(--c-brand);
  font-weight: bold;
  font-size: 1.2rem;
}

/* Architecture Visual */
.architecture-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 2rem;
}

.arch-box {
  background: var(--c-brand);
  color: white;
  padding: 1rem 2rem;
  border-radius: 8px;
  font-weight: 600;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.arch-arrow {
  font-size: 1.5rem;
  color: var(--c-text-light);
}

@media (max-width: 768px) {
  .page-title {
    font-size: 2rem;
  }
  
  .architecture-visual {
    flex-direction: column;
  }
  
  .arch-arrow {
    transform: rotate(90deg);
  }
}
</style>
