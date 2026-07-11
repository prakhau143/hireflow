export interface SkillCategory {
  name: string
  skills: string[]
}

export const SKILL_CATEGORIES: SkillCategory[] = [
  {
    name: 'Programming Languages',
    skills: [
      'Python',
      'Java',
      'JavaScript',
      'TypeScript',
      'C',
      'C++',
      'C#',
      'Go',
      'Rust',
      'PHP',
      'Ruby',
      'Kotlin',
      'Swift',
      'Dart',
      'Scala',
      'R',
      'MATLAB',
    ],
  },
  {
    name: 'Frontend',
    skills: [
      'HTML',
      'CSS',
      'Tailwind CSS',
      'Bootstrap',
      'Sass',
      'React',
      'Next.js',
      'Vue.js',
      'Nuxt.js',
      'Angular',
      'Svelte',
      'Redux',
      'Zustand',
    ],
  },
  {
    name: 'Backend',
    skills: [
      'Node.js',
      'Express.js',
      'FastAPI',
      'Django',
      'Flask',
      'Spring Boot',
      'ASP.NET',
      'Laravel',
      'NestJS',
      'Ruby on Rails',
    ],
  },
  {
    name: 'Mobile',
    skills: [
      'Flutter',
      'React Native',
      'Android',
      'Jetpack Compose',
      'iOS',
      'SwiftUI',
    ],
  },
  {
    name: 'Databases',
    skills: [
      'MySQL',
      'PostgreSQL',
      'MongoDB',
      'Redis',
      'SQLite',
      'MariaDB',
      'Oracle',
      'Firebase',
      'Supabase',
      'DynamoDB',
      'Cassandra',
    ],
  },
  {
    name: 'Cloud',
    skills: [
      'AWS',
      'Azure',
      'Google Cloud',
      'DigitalOcean',
      'Cloudflare',
      'Vercel',
      'Netlify',
      'Railway',
      'Render',
    ],
  },
  {
    name: 'DevOps',
    skills: [
      'Docker',
      'Kubernetes',
      'Jenkins',
      'GitHub Actions',
      'GitLab CI',
      'Terraform',
      'Ansible',
      'Linux',
      'Nginx',
      'Apache',
    ],
  },
  {
    name: 'AI / ML',
    skills: [
      'Machine Learning',
      'Deep Learning',
      'TensorFlow',
      'PyTorch',
      'OpenCV',
      'Scikit-learn',
      'LangChain',
      'LlamaIndex',
      'Groq API',
      'OpenAI API',
      'Hugging Face',
      'RAG',
      'Vector Database',
      'FAISS',
      'Pinecone',
      'ChromaDB',
    ],
  },
  {
    name: 'Data Engineering',
    skills: [
      'Apache Spark',
      'Kafka',
      'Airflow',
      'Hadoop',
      'Snowflake',
      'dbt',
    ],
  },
  {
    name: 'Testing',
    skills: [
      'Jest',
      'Vitest',
      'Pytest',
      'JUnit',
      'Cypress',
      'Playwright',
      'Selenium',
    ],
  },
  {
    name: 'Tools',
    skills: [
      'Git',
      'GitHub',
      'GitLab',
      'Postman',
      'Figma',
      'VS Code',
      'Jira',
      'Slack',
      'Notion',
    ],
  },
  {
    name: 'Security',
    skills: [
      'OAuth',
      'JWT',
      'OAuth2',
      'Keycloak',
      'Auth0',
    ],
  },
]

// Frequently selected skills (for suggestions)
export const FREQUENT_SKILLS = [
  'Python',
  'JavaScript',
  'TypeScript',
  'React',
  'Node.js',
  'AWS',
  'Docker',
  'PostgreSQL',
  'Git',
  'FastAPI',
  'Next.js',
  'Tailwind CSS',
  'MongoDB',
  'Redis',
  'Kubernetes',
]

// Get all skills as a flat array
export const ALL_SKILLS = SKILL_CATEGORIES.flatMap((category) => category.skills)

// Check if a skill exists in the master list
export function isSkillInMasterList(skill: string): boolean {
  return ALL_SKILLS.includes(skill)
}
