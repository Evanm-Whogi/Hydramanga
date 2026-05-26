import { db, schema } from '@/db/index';
import { sql } from 'drizzle-orm';
import logger from '@/services/loggerService';
import { cacheService } from '@/services/cacheService';
import { CATALOG_CACHE_TTL } from '@/lib/catalogCache';

export async function getCollectionsList() {
     const genreMetadata = [
        { name: "Romance", description: "Discover heartwarming love stories, emotional relationships, and the complexities of romantic connections in these captivating series." },
        { name: "Comedy", description: "Dive into lighthearted stories filled with witty humor, hilarious misunderstandings, and entertaining scenarios that range from clever satire to slapstick comedy" },
        { name: "Fantasy", description: "Journey through realms of magic, where epic quests and supernatural powers collide in spellbinding fantasy tales." },
        { name: "Drama", description: "Real emotions, complicated relationships, and life-changing moments. These compelling stories hold up a mirror to life itself, making you feel every high and low" },
        { name: "School Life", description: "From first-day jitters to graduation tears, these stories capture all the drama, friendship, and unforgettable moments that make school life special. Class is in session!" },
        { name: "Shounen", description: "Experience thrilling adventures filled with intense battles, unwavering friendships, and heroic journeys where determined protagonists overcome increasingly powerful" },
        { name: "Shoujo", description: "Experience heartfelt stories centered around young heroines navigating love, friendship, and personal growth, with distinctive art styles featuring expressive character" },
        { name: "Seinen", description: "Sophisticated narratives and complex themes in manga series crafted for mature readers, featuring realistic storytelling." },
        { name: "Supernatural", description: "Venture into a world where the ordinary meets the extraordinary, featuring spirits, curses, and otherworldly phenomena. These stories blur the lines between reality" },
        { name: "Boys Love", description: "Explore heartwarming and passionate stories of romance between men, featuring emotional storytelling, character growth, and the beautiful complexities of male relationships." },
        { name: "Slice of Life", description: "Immerse yourself in gentle stories that celebrate the beauty of everyday moments, where simple daily experiences and quiet personal growth create meaningful connections." },
        { name: "Ecchi", description: "Playful and suggestive comedies featuring romantic mishaps, awkward situations, and light fanservice, blending humor with romance in entertaining and cheeky" },
        { name: "Mystery", description: "Unravel thrilling mysteries filled with suspense, unexpected twists, and complex characters. These stories will keep you guessing until the very end." },
        { name: "Horror", description: "Brace yourself for chilling tales that delve into the darkest corners of fear, featuring supernatural entities, psychological terror, and spine-tingling suspense." },
        { name: "Action", description: "Experience high-octane excitement with intense battles, daring feats, and relentless energy. These stories are packed with adrenaline-pumping action from start to finish." },
        { name: "Adventure", description: "Embark on epic journeys filled with exploration, danger, and discovery. These stories take you to uncharted territories where heroes face thrilling challenges." },
        { name: "Psychological", description: "Delve into the complexities of the human mind with stories that explore psychological tension, moral dilemmas, and the intricate workings of characters' psyches." },
        { name: "Tragedy", description: "Experience powerful narratives that explore themes of loss, sacrifice, and the human condition. These stories evoke deep emotions and often leave a lasting impact on readers." },
        { name: "Award Winning", description: "Discover critically acclaimed manga series that have received prestigious awards for their exceptional storytelling, art, and impact on the medium." },
        { name: "Avant Garde", description: "Explore experimental and unconventional manga that pushes the boundaries of storytelling and art, offering unique and thought-provoking experiences." },
        { name: "Gourmet", description: "Savor delicious stories centered around food, cooking, and culinary adventures. These manga will whet your appetite with mouthwatering dishes and heartfelt narratives." },
        { name: "Gender Bender", description: "Experience stories that challenge traditional gender roles, featuring characters who crossdress, switch genders, or explore fluid identities, often with humor and heart." },
        { name: "Harem", description: "Dive into romantic comedies where a single protagonist finds themselves surrounded by multiple love interests, leading to humorous and heartfelt situations." },
        { name: "Historical", description: "Travel back in time with stories set in various historical periods, blending real events and figures with compelling narratives and rich world-building." },
        { name: "Josei", description: "Experience mature and realistic stories that explore the lives, relationships, and personal growth of adult women." },
        { name: "Mahou Shoujo", description: "Enter a world of magic and wonder with stories featuring young heroines who transform into magical beings." },
        { name: "Martial Arts", description: "Experience intense battles and disciplined training in stories centered around martial arts, where characters strive for strength and honor." },
        { name: "Mature", description: "Explore complex themes and mature storytelling that delves into the intricacies of human relationships, societal issues, and personal growth." },
        { name: "Mecha", description: "Dive into futuristic worlds where giant robots and advanced technology play a central role in epic battles and intricate plots." },
        { name: "Music", description: "Experience the rhythm of stories centered around music, where characters pursue their passions, form bands, and navigate the highs and lows of the music industry." },
        { name: "Sci-Fi", description: "Venture into speculative futures with stories that explore advanced technology, space exploration, and the impact of science on society." },
        { name: "Shoujo Ai", description: "Discover tender and emotional stories of romance between young women, featuring heartfelt narratives and deep emotional connections." },
        { name: "Shounen Ai", description: "Explore sweet and emotional stories of romance between young men, focusing on character development and heartfelt relationships." },
        { name: "Sports", description: "Get in the game with stories that capture the thrill of competition, teamwork, and personal growth through sports." },
        { name: "Suspense", description: "Experience nail-biting tension and uncertainty in stories that keep you on the edge of your seat with unexpected twists and high stakes." },
        { name: "Thriller", description: "Dive into fast-paced and gripping narratives filled with danger, intrigue, and suspense that will keep you hooked until the last page." },
        { name: "Yaoi", description: "Explore passionate and emotional stories of romance between men, featuring intense relationships and heartfelt storytelling." },
        { name: "Yuri", description: "Discover beautiful and emotional stories of romance between women, featuring deep emotional connections and heartfelt narratives." },
        { name: "Lolicon", description: "Note: This genre contains content that may be inappropriate or offensive to some audiences. It typically features romantic or sexual relationships involving underage characters. Please exercise discretion when exploring this genre." },
        { name: "Shotacon", description: "Note: This genre contains content that may be inappropriate or offensive to some audiences. It typically features romantic or sexual relationships involving underage characters. Please exercise discretion when exploring this genre." },
        { name: "Hentai", description: "Explicit adult content featuring graphic depictions of sexual themes. This genre is intended for mature audiences only and often explores a wide range of fantasies and fetishes." },
        { name: "Smut", description: "Steamy stories that focus on explicit romantic and sexual relationships, often blending passionate storytelling with mature themes." },
        { name: "Doujinshi", description: "Fan-created works that can range from lighthearted parodies to original stories, often exploring popular series or unique concepts with a personal touch." },
        { name: "Adult", description: "Mature content that explores explicit themes, relationships, and narratives intended for adult audiences, often delving into complex and provocative storytelling." },
        { name: "Erotica", description: "Sensual and provocative stories that explore themes of desire, intimacy, and passion, often with explicit content intended for mature audiences." },
        { name: "Girls Love", description: "Discover tender and emotional stories of romance between young women, featuring heartfelt narratives and deep emotional connections." },
    ];

    // Fallback description for any genre not explicitly defined above
    const defaultDescription = "Explore a curated selection of popular titles within this category.";

    const cacheKey = `collections:genres:v2`; // Updated key since data structure changed

    try {
        const collectionsData = await cacheService.getOrSet(
            {
                key: cacheKey,
                ttl: CATALOG_CACHE_TTL,
            },
            async () => {
                const genreNames = genreMetadata.map(g => g.name);

                const results = await db.execute(sql`
                    WITH expanded_manga AS (
                        SELECT 
                            jsonb_array_elements_text(${schema.series.genres}) as genre,
                            ${schema.series.id} as id,
                            ${schema.series.title} as title,
                            ${schema.series.cover} as cover,
                            ${schema.series.weightedScore} as "weightedScore",
                            CASE WHEN ${schema.series.weightedScore} >= 75 THEN 1 ELSE 2 END as priority
                        FROM ${schema.series}
                        WHERE ${schema.series.genres} IS NOT NULL
                    ),
                    ranked_manga AS (
                        SELECT *,
                            ROW_NUMBER() OVER(
                                PARTITION BY genre 
                                ORDER BY priority ASC, RANDOM() 
                            ) as rank,
                            COUNT(*) OVER(PARTITION BY genre) as total_count
                        FROM expanded_manga
                        WHERE genre = ANY(ARRAY[${sql.join(genreNames.map(g => sql`${g}`), sql`, `)}])
                    )
                    SELECT * FROM ranked_manga WHERE rank <= 3
                `);

                const data: any = {};
                
                // 2. Pre-fill with name and description
                genreMetadata.forEach(g => {
                    data[g.name] = { 
                        description: g.description,
                        count: 0, 
                        topManga: [] 
                    };
                });

                const rows = (results.rows || results) as any[];

                rows.forEach((row) => {
                    const { genre, total_count, id, title, cover, weightedScore } = row;
                    if (data[genre]) {
                        data[genre].count = Number(total_count);
                        data[genre].topManga.push({ id, title, cover, weightedScore });
                    }
                });

                return data;
            }
        );

        return collectionsData
    } catch (error) {
        logger.error("Error fetching collections data", { error });
        return {};
    }

}