export const DEFAULT_WELCOME_MODAL_TITLE = `Welcome to ${process.env.NEXT_PUBLIC_NAME ?? 'HydraManga'}`;

export const DEFAULT_WELCOME_MODAL_DESCRIPTION =
  process.env.NEXT_PUBLIC_DESC ??
  'HydraManga gives you total control over how you discover and read. Earn badges, climb the leaderboards, and join a community that never sleeps. Are you ready to read?';

export const DEFAULT_WELCOME_MODAL_BODY = `A little bit of information before you get started:

- **We currently have no plans to add any ads or paid features.**
- You can create an account to save your favorite manga, read lists, and more.
- Manga chapters are updated twice daily at 7:00 AM and 7:00 PM PST.
- You can request new manga to be added to the site from the [Request](/request) page.
- Every file is downloaded, managed, and transcoded in house.
- No manga chapters are hotlinked from external sources.
- Import requests are processed manually and may take up to 24 hours.
- This is a passion project and is not a full-time job.`;

export const DEFAULT_MAINTENANCE_MESSAGE =
  'We are performing scheduled maintenance. The site will be back online shortly.';
