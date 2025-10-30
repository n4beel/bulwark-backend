import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
    @Prop({ required: true, unique: true })
    githubId: number; // GitHub user ID

    @Prop({ required: true })
    githubUsername: string; // GitHub login

    @Prop()
    email?: string;

    @Prop()
    name?: string;

    @Prop()
    avatarUrl?: string;

    @Prop({ default: Date.now })
    createdAt: Date;

    @Prop({ default: Date.now })
    updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

