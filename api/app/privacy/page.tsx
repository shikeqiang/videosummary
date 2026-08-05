export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 prose prose-zinc">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-zinc-500">Last updated: 2026</p>

      <h2>1. What we collect</h2>
      <ul>
        <li>Email (when you sign in)</li>
        <li>Anonymous usage counters (number of summaries, no transcript text)</li>
        <li>Subscription status from Lemon Squeezy</li>
      </ul>

      <h2>2. What we DO NOT collect</h2>
      <ul>
        <li>We never store the actual video transcripts.</li>
        <li>We never sell your data.</li>
      </ul>

      <h2>3. Third parties</h2>
      <ul>
        <li><strong>Supabase</strong>: user auth + DB</li>
        <li><strong>OpenAI</strong>: AI summarization (data not used for training)</li>
        <li><strong>Lemon Squeezy</strong>: payment (Merchant of Record)</li>
        <li><strong>Upstash Redis</strong>: cache</li>
      </ul>

      <h2>4. Your rights</h2>
      <p>You can request deletion of your account at any time by emailing support.</p>
    </main>
  )
}
