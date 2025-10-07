import {Schema, model} from "mongoose";

const userSchema = new Schema(
  {
    uid: {type: String, required: true},
    email: {type: String, required: true, unique: true},
    firstName: {type: String, required: true},
    lastName: {type: String, required: true},
    middleName: {type: String},
    birthDate: {type: Date},
    profilePictureUrl: {type: String},
  },
  {timestamps: true}
);

const UserModel = model("User", userSchema);
export default UserModel;

export type User = {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  birthDate: string;
  profilePictureUrl?: string;
};
export type UserDocument = User & {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
};
