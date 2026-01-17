import Api from "@/lib/api"

interface response {
    user: any;
    session: any;
}

// Client-side user fetch (for client components)
export async function getUser(): Promise<response> {
    try {
        const response = await Api.get('/user/me');
        return {
            user: response?.data?.user,
            session: response?.data?.session,
        };
    } catch (error) {
        console.error("Error fetching user data:", error);
        return {"Unauthorized": true} as any;
    }
}