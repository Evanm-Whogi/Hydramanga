"use client";
import { useState } from "react";
import { signUp } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Image from "next/image";
import InputField from '@/components/InputField';
import MasonryGrid from "@/components/MasonryGrid";
import { toast } from "react-toastify";

export default function Register() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const router = useRouter();

    const handleRegister = async () => {
        const { data, error } = await signUp.email({ email, password, name, callbackURL: "/dashboard" });
        if (error) { 
            toast(`${error.message}`, { type: 'error' });
        }
        else { 
            toast(`Welcome ${data.user.name}! Your account has been created.`, { type: 'success' });
            router.push("/home"); 
        }
    };

    return (
        <section className="py-45">
            <div className="container mx-auto">
                <div className="flex flex-row">
                    <div className="w-3/4 -z-50"><MasonryGrid/></div>
                    <div className="flex flex-col w-1/4 p-5 space-y-2">
                    <Image src="/logo.png" width="192" height="192" alt="Login Logo" className="mx-auto"/>
                    <h1 className="text-4xl font-bold text-center">{process.env.NEXT_PUBLIC_NAME}</h1>
                     <h2 className="text-muted text-center">Your one stop spot for endless Manga.</h2>
                    <div className="flex flex-col space-y-3 mt-5">
                        <InputField label="Full Name" placeholder="Your Name" value={name} onChange={(e: any) => setName(e.target.value)} />
                        <InputField label="Email" placeholder="Email" value={email} onChange={(e: any) => setEmail(e.target.value)} />
                        <InputField label="Password" placeholder="Password" type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} />
                    </div>
                    <button onClick={handleRegister} className="p-3 mt-5 bg-foreground text-primary hover:bg-foreground/50 hover:cursor-pointer rounded-lg">Create Account</button>
                    <span className="text-center pt-5">Already have an account? <a href="/login" className="text-accent hover:text-accent/50">Log in</a></span>
                </div>
                </div>

            </div>
        </section>
    );
}