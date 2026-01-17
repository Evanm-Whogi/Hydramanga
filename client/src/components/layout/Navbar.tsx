"use server"
import { cookies } from 'next/headers';
import NavbarClient from './NavbarClient';


export default async function Navbar() {
    const cookieStore = await cookies();
    const theme = cookieStore.get('theme')?.value || 'theme-dark';
    
    return <NavbarClient initialTheme={theme} />;
}
